from sqlalchemy.orm import Session

from app.services.ingestion import IngestionService
from app.services.repository import FraudRepository


CSV_PAYLOAD = b"""transaction_id,account_id,merchant_id,amount,event_ts,source_partition
tx-1,acct-1,merchant-1,25.00,2026-01-01T00:00:00Z,tenant-a
tx-2,acct-1,merchant-2,31.00,2026-01-01T01:00:00Z,tenant-a
"""


class FlakyRepository(FraudRepository):
    def __init__(self):
        super().__init__()
        self.calls = 0

    def persist_transactions_batch(self, session: Session, records: list[dict]) -> int:
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError("temporary failure")
        return super().persist_transactions_batch(session, records)


def test_ingestion_retries_batch_until_success(db_session: Session):
    repository = FlakyRepository()
    service = IngestionService(repository=repository)

    inserted = service.ingest_csv(
        db_session,
        CSV_PAYLOAD,
        default_partition=None,
        batch_size=10,
        max_retries=3,
        retry_backoff_seconds=0,
    )

    assert inserted == {"tenant-a": 2}
    assert repository.calls == 2


def test_ingestion_requires_partition_when_not_present(db_session: Session):
    service = IngestionService()
    payload = b"""transaction_id,account_id,merchant_id,amount,event_ts
tx-1,acct-1,merchant-1,25.00,2026-01-01T00:00:00Z
"""

    try:
        service.ingest_csv(
            db_session,
            payload,
            default_partition=None,
            batch_size=10,
            max_retries=1,
            retry_backoff_seconds=0,
        )
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "source partition" in str(exc).lower()

