from sqlalchemy.orm import Session

from app.config import Settings
from app.services.pipeline import FraudPipelineService


def test_pipeline_returns_partition_summaries(db_session: Session):
    settings = Settings(
        DATABASE_URL="sqlite:///./unused.db",
        BATCH_SIZE=2,
        MAX_RETRIES=1,
        RETRY_BACKOFF_SECONDS=0,
        TIME_WINDOWS_HOURS="1",
        ZSCORE_THRESHOLD=1.2,
        VELOCITY_THRESHOLD=3,
        AMOUNT_RATIO_THRESHOLD=2.5,
    )
    pipeline = FraudPipelineService(settings=settings)
    payload = b"""transaction_id,account_id,merchant_id,amount,event_ts,source_partition
tx-1,acct-1,merchant-1,10.00,2026-01-01T00:00:00Z,tenant-a
tx-2,acct-1,merchant-1,10.00,2026-01-01T00:05:00Z,tenant-a
tx-3,acct-1,merchant-1,120.00,2026-01-01T00:10:00Z,tenant-a
"""

    result = pipeline.process_upload(db_session, payload, default_partition=None)

    assert result["processed_partitions"] == 1
    assert result["processed_records"] == 3
    assert result["total_alerts"] >= 1
    assert result["partitions"][0]["source_partition"] == "tenant-a"


def test_pipeline_reports_progress_updates(db_session: Session):
    settings = Settings(
        DATABASE_URL="sqlite:///./unused.db",
        BATCH_SIZE=2,
        MAX_RETRIES=1,
        RETRY_BACKOFF_SECONDS=0,
        TIME_WINDOWS_HOURS="1",
        ZSCORE_THRESHOLD=1.2,
        VELOCITY_THRESHOLD=3,
        AMOUNT_RATIO_THRESHOLD=2.5,
    )
    pipeline = FraudPipelineService(settings=settings)
    payload = b"""transaction_id,account_id,merchant_id,amount,event_ts,source_partition
tx-1,acct-1,merchant-1,10.00,2026-01-01T00:00:00Z,tenant-a
tx-2,acct-1,merchant-1,10.00,2026-01-01T00:05:00Z,tenant-a
tx-3,acct-1,merchant-1,120.00,2026-01-01T00:10:00Z,tenant-a
"""
    progress_updates = []

    pipeline.process_upload(
        db_session,
        payload,
        default_partition=None,
        progress_callback=lambda stage, percentage: progress_updates.append((stage, percentage)),
    )

    assert progress_updates[0] == ("ingesting_transactions", 10)
    assert progress_updates[-1] == ("finalizing_results", 100)
