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
            window_frame = self._compute_window_metrics(dataframe, window_hours)

            velocity_candidates = window_frame.loc[
                window_frame["count_in_window"] >= velocity_threshold
            ].copy()
            if not velocity_candidates.empty:
                velocity_candidates["score"] = (
                    velocity_candidates["count_in_window"] / velocity_threshold
                ).round(3)
                alerts.extend(
                    self._build_alerts_from_frame(
                        velocity_candidates,
                        created_at=created_at,
                        source_partition=source_partition,
                        rule_name="velocity_spike",
                        window_hours=window_hours,
                        severity_builder=lambda row: self._severity(row.score),
                        details_builder=lambda row: {
                            "explanation": (
                                f"{int(row.count_in_window)} transactions in the last "
                                f"{window_hours} hour(s) exceeded the threshold of "
                                f"{velocity_threshold}."
                            ),
                            "count_in_window": int(row.count_in_window),
                            "threshold": velocity_threshold,
                        },
                    )
                )

            amount_candidates = window_frame.loc[window_frame["count_in_window"] >= 3].copy()
            if not amount_candidates.empty:
                median_reference = amount_candidates["median_amount"].where(
                    amount_candidates["median_amount"] != 0
                )
                std_reference = amount_candidates["std_amount"].where(
                    amount_candidates["std_amount"] != 0
                )
                amount_candidates["amount_ratio"] = (
                    amount_candidates["amount"] / median_reference
                ).fillna(0.0)
                amount_candidates["zscore"] = (
                    (amount_candidates["amount"] - amount_candidates["mean_amount"])
                    / std_reference
                ).fillna(0.0)
                amount_candidates = amount_candidates.loc[
                    (amount_candidates["zscore"] >= zscore_threshold)
                    | (amount_candidates["amount_ratio"] >= amount_ratio_threshold)
                ].copy()
                if not amount_candidates.empty:
                    amount_candidates["score"] = amount_candidates[
                        ["zscore", "amount_ratio"]
                    ].max(axis=1)
                    amount_candidates["score"] = amount_candidates["score"].round(3)
                    alerts.extend(
                        self._build_alerts_from_frame(
                            amount_candidates,
                            created_at=created_at,
                            source_partition=source_partition,
                            rule_name="amount_spike",
                            window_hours=window_hours,
                            severity_builder=lambda row: self._severity(
                                row.score / max(zscore_threshold, 1.0)
                            ),
                            details_builder=lambda row: {
                                "explanation": (
                                    f"Amount was {round(float(row.amount_ratio), 2)}x the recent median "
                                    f"with z-score {round(float(row.zscore), 2)} in the last "
                                    f"{window_hours} hour(s)."
                                ),
                                "mean_amount": round(float(row.mean_amount), 2),
                                "median_amount": round(float(row.median_amount), 2),
                                "std_amount": round(float(row.std_amount), 2),
                                "zscore": round(float(row.zscore), 3),
                                "amount_ratio": round(float(row.amount_ratio), 3),
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

    def _compute_window_metrics(self, dataframe: pd.DataFrame, window_hours: int) -> pd.DataFrame:
        rolling_window = f"{window_hours}h"
        rolling_group = dataframe.groupby("account_id", sort=False).rolling(
            rolling_window,
            on="event_ts",
        )
        aggregates = (
            rolling_group["amount"]
            .agg(["count", "mean", "median"])
            .reset_index(drop=True)
            .rename(
                columns={
                    "count": "count_in_window",
                    "mean": "mean_amount",
                    "median": "median_amount",
                }
            )
        )
        std_amount = (
            rolling_group["amount"]
            .std(ddof=0)
            .reset_index(drop=True)
            .fillna(0.0)
            .rename("std_amount")
        )

        window_frame = dataframe.copy()
        window_frame["count_in_window"] = aggregates["count_in_window"].astype(int)
        window_frame["mean_amount"] = aggregates["mean_amount"].astype(float)
        window_frame["median_amount"] = aggregates["median_amount"].astype(float)
        window_frame["std_amount"] = std_amount.astype(float)
        return window_frame

    def _build_alerts_from_frame(
        self,
        dataframe: pd.DataFrame,
        *,
        created_at,
        source_partition: str,
        rule_name: str,
        window_hours: int,
        severity_builder,
        details_builder,
    ) -> list[dict]:
        alerts: list[dict] = []
        for row in dataframe.itertuples(index=False):
            details = details_builder(row)
            alerts.append(
                self._build_alert(
                    row=row,
                    created_at=created_at,
                    source_partition=source_partition,
                    rule_name=rule_name,
                    severity=severity_builder(row),
                    score=float(row.score),
                    window_hours=window_hours,
                    details=details,
                )
            )
        return alerts

    def _build_alert(
        self,
        *,
        row,
        created_at,
        source_partition: str,
        rule_name: str,
        severity: str,
        score: float,
        window_hours: int,
        details: dict,
    ) -> dict:
        event_ts = row.event_ts
        if hasattr(event_ts, "to_pydatetime"):
            event_ts = event_ts.to_pydatetime()
        if event_ts.tzinfo is None:
            event_ts = event_ts.replace(tzinfo=timezone.utc)

        return {
            "source_partition": source_partition,
            "transaction_id": str(row.transaction_id),
            "account_id": str(row.account_id),
            "merchant_id": str(row.merchant_id),
            "rule_name": rule_name,
            "severity": severity,
            "score": round(score, 3),
            "window_hours": window_hours,
            "details": details | {"event_ts": event_ts.isoformat(), "analyst_status": "open"},
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
