from __future__ import annotations

from collections import Counter
from datetime import timezone

import pandas as pd
from sqlalchemy.orm import Session

from app.models import utcnow
from app.services.repository import FraudRepository


class DetectionService:
    def __init__(self, repository: FraudRepository | None = None):
        self.repository = repository or FraudRepository()

    def analyze_partition(
        self,
        session: Session,
        *,
        source_partition: str,
        time_windows_hours: list[int],
        zscore_threshold: float,
        velocity_threshold: int,
        amount_ratio_threshold: float,
    ) -> dict:
        records = self.repository.fetch_partition_transactions(session, source_partition)
        dataframe = pd.DataFrame(records)

        if dataframe.empty:
            self.repository.replace_partition_alerts(session, source_partition, [])
            session.commit()
            return {
                "source_partition": source_partition,
                "transaction_count": 0,
                "alert_count": 0,
                "rules_triggered": {},
                "alerts": [],
            }

        dataframe["event_ts"] = pd.to_datetime(dataframe["event_ts"], utc=True)
        dataframe["amount"] = pd.to_numeric(dataframe["amount"])
        dataframe = dataframe.sort_values(["account_id", "event_ts", "transaction_id"]).reset_index(drop=True)

        alerts: list[dict] = []
        created_at = utcnow()

        for window_hours in sorted(set(time_windows_hours)):
            window_delta = pd.Timedelta(hours=window_hours)
            for _, group in dataframe.groupby("account_id", sort=False):
                group = group.reset_index(drop=True)
                for index, current_row in group.iterrows():
                    window_start = current_row["event_ts"] - window_delta
                    history = group.loc[
                        (group["event_ts"] >= window_start)
                        & (group["event_ts"] <= current_row["event_ts"])
                    ]

                    count_in_window = int(history.shape[0])
                    median_amount = float(history["amount"].median()) if count_in_window else 0.0
                    mean_amount = float(history["amount"].mean()) if count_in_window else 0.0
                    std_amount = float(history["amount"].std(ddof=0)) if count_in_window > 1 else 0.0

                    if count_in_window >= velocity_threshold:
                        alerts.append(
                            self._build_alert(
                                current_row=current_row,
                                created_at=created_at,
                                source_partition=source_partition,
                                rule_name="velocity_spike",
                                severity=self._severity(float(count_in_window) / velocity_threshold),
                                score=round(float(count_in_window) / velocity_threshold, 3),
                                window_hours=window_hours,
                                details={
                                    "count_in_window": count_in_window,
                                    "threshold": velocity_threshold,
                                },
                            )
                        )

                    if count_in_window >= 3:
                        ratio = (current_row["amount"] / median_amount) if median_amount else 0.0
                        zscore = (
                            (current_row["amount"] - mean_amount) / std_amount
                            if std_amount
                            else 0.0
                        )
                        if zscore >= zscore_threshold or ratio >= amount_ratio_threshold:
                            score = max(zscore, ratio)
                            alerts.append(
                                self._build_alert(
                                    current_row=current_row,
                                    created_at=created_at,
                                    source_partition=source_partition,
                                    rule_name="amount_spike",
                                    severity=self._severity(score / max(zscore_threshold, 1.0)),
                                    score=round(float(score), 3),
                                    window_hours=window_hours,
                                    details={
                                        "mean_amount": round(mean_amount, 2),
                                        "median_amount": round(median_amount, 2),
                                        "std_amount": round(std_amount, 2),
                                        "zscore": round(float(zscore), 3),
                                        "amount_ratio": round(float(ratio), 3),
                                    },
                                )
                            )

        deduplicated = self._deduplicate_alerts(alerts)
        self.repository.replace_partition_alerts(session, source_partition, deduplicated)
        session.commit()

        rules_triggered = dict(Counter(alert["rule_name"] for alert in deduplicated))
        stored_alerts = self.repository.fetch_partition_alerts(session, source_partition)
        return {
            "source_partition": source_partition,
            "transaction_count": int(dataframe.shape[0]),
            "alert_count": len(stored_alerts),
            "rules_triggered": rules_triggered,
            "alerts": stored_alerts,
        }

    def _build_alert(
        self,
        *,
        current_row: pd.Series,
        created_at,
        source_partition: str,
        rule_name: str,
        severity: str,
        score: float,
        window_hours: int,
        details: dict,
    ) -> dict:
        event_ts = current_row["event_ts"]
        if hasattr(event_ts, "to_pydatetime"):
            event_ts = event_ts.to_pydatetime()
        if event_ts.tzinfo is None:
            event_ts = event_ts.replace(tzinfo=timezone.utc)

        return {
            "source_partition": source_partition,
            "transaction_id": str(current_row["transaction_id"]),
            "account_id": str(current_row["account_id"]),
            "merchant_id": str(current_row["merchant_id"]),
            "rule_name": rule_name,
            "severity": severity,
            "score": score,
            "window_hours": window_hours,
            "details": details | {"event_ts": event_ts.isoformat()},
            "created_at": created_at,
        }

    def _deduplicate_alerts(self, alerts: list[dict]) -> list[dict]:
        deduplicated: dict[tuple[str, str, str, int], dict] = {}
        for alert in alerts:
            key = (
                alert["source_partition"],
                alert["transaction_id"],
                alert["rule_name"],
                alert["window_hours"],
            )
            existing = deduplicated.get(key)
            if existing is None or alert["score"] > existing["score"]:
                deduplicated[key] = alert
        return list(deduplicated.values())

    def _severity(self, normalized_score: float) -> str:
        if normalized_score >= 2.5:
            return "critical"
        if normalized_score >= 1.5:
            return "high"
        if normalized_score >= 1.0:
            return "medium"
        return "low"

