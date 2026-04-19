from sqlalchemy import delete, insert, select, tuple_
from sqlalchemy.orm import Session

from app.models import FraudAlert, Transaction


class FraudRepository:
    def persist_transactions_batch(self, session: Session, records: list[dict]) -> int:
        if not records:
            return 0

        keys = [(record["source_partition"], record["transaction_id"]) for record in records]
        existing = set(
            session.execute(
                select(Transaction.source_partition, Transaction.transaction_id).where(
                    tuple_(Transaction.source_partition, Transaction.transaction_id).in_(keys)
                )
            ).all()
        )
        new_records = [
            record
            for record in records
            if (record["source_partition"], record["transaction_id"]) not in existing
        ]
        if not new_records:
            return 0
        session.execute(insert(Transaction), new_records)
        return len(new_records)

    def fetch_partition_transactions(self, session: Session, source_partition: str) -> list[dict]:
        rows = session.execute(
            select(
                Transaction.source_partition,
                Transaction.transaction_id,
                Transaction.account_id,
                Transaction.merchant_id,
                Transaction.amount,
                Transaction.event_ts,
                Transaction.country_code,
                Transaction.device_id,
                Transaction.status,
            ).where(Transaction.source_partition == source_partition)
        ).mappings()
        return [dict(row) for row in rows]

    def replace_partition_alerts(
        self,
        session: Session,
        source_partition: str,
        alerts: list[dict],
    ) -> None:
        session.execute(delete(FraudAlert).where(FraudAlert.source_partition == source_partition))
        if alerts:
            session.execute(insert(FraudAlert), alerts)

    def fetch_partition_alerts(self, session: Session, source_partition: str) -> list[FraudAlert]:
        rows = session.execute(
            select(FraudAlert)
            .where(FraudAlert.source_partition == source_partition)
            .order_by(FraudAlert.score.desc(), FraudAlert.created_at.desc())
        )
        return list(rows.scalars().all())

    def fetch_alerts(
        self,
        session: Session,
        *,
        source_partition: str | None = None,
        severity: str | None = None,
        rule_name: str | None = None,
        account_id: str | None = None,
        merchant_id: str | None = None,
        window_hours: int | None = None,
        analyst_status: str | None = None,
    ) -> list[FraudAlert]:
        query = select(FraudAlert)
        if source_partition:
            query = query.where(FraudAlert.source_partition == source_partition)
        if severity:
            query = query.where(FraudAlert.severity == severity)
        if rule_name:
            query = query.where(FraudAlert.rule_name == rule_name)
        if account_id:
            query = query.where(FraudAlert.account_id == account_id)
        if merchant_id:
            query = query.where(FraudAlert.merchant_id == merchant_id)
        if window_hours is not None:
            query = query.where(FraudAlert.window_hours == window_hours)

        rows = session.execute(
            query.order_by(FraudAlert.score.desc(), FraudAlert.created_at.desc())
        )
        alerts = list(rows.scalars().all())
        if analyst_status:
            alerts = [alert for alert in alerts if alert.analyst_status == analyst_status]
        return alerts

    def update_alert_status(
        self,
        session: Session,
        *,
        alert_id: int,
        analyst_status: str,
    ) -> FraudAlert | None:
        alert = session.get(FraudAlert, alert_id)
        if alert is None:
            return None

        details = dict(alert.details or {})
        details["analyst_status"] = analyst_status
        alert.details = details
        session.commit()
        session.refresh(alert)
        return alert

    def list_partitions(self, session: Session) -> list[str]:
        rows = session.execute(
            select(Transaction.source_partition).distinct().order_by(Transaction.source_partition)
        )
        return [row[0] for row in rows]

    def count_partition_transactions(self, session: Session, source_partition: str) -> int:
        return len(self.fetch_partition_transactions(session, source_partition))
