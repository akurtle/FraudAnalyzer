from app.config import Settings
from app.services.jobs import AnalysisJobService
from app.services.pipeline import FraudPipelineService


class InlineExecutor:
    def submit(self, fn, *args, **kwargs):
        fn(*args, **kwargs)
        return None


def test_analysis_job_runs_to_completion(db_session_factory):
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
    job_service = AnalysisJobService(
        session_factory=db_session_factory,
        pipeline=pipeline,
        executor=InlineExecutor(),
    )
    payload = b"""transaction_id,account_id,merchant_id,amount,event_ts,source_partition
tx-1,acct-1,merchant-1,10.00,2026-01-01T00:00:00Z,tenant-a
tx-2,acct-1,merchant-1,10.00,2026-01-01T00:05:00Z,tenant-a
tx-3,acct-1,merchant-1,120.00,2026-01-01T00:10:00Z,tenant-a
"""

    accepted = job_service.submit_job(
        payload=payload,
        default_partition=None,
        batch_size=2,
        max_retries=1,
        time_windows_hours=[1],
    )

    with db_session_factory() as session:
        response = job_service.get_job_response(session, accepted.job_id)

    assert response is not None
    assert response.status == "completed"
    assert response.result is not None
    assert response.result.processed_partitions == 1
    assert response.result.total_alerts >= 1


def test_analysis_job_captures_failures(db_session_factory):
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
    job_service = AnalysisJobService(
        session_factory=db_session_factory,
        pipeline=pipeline,
        executor=InlineExecutor(),
    )
    bad_payload = b"""transaction_id,merchant_id,amount,event_ts,source_partition
tx-1,merchant-1,10.00,2026-01-01T00:00:00Z,tenant-a
"""

    accepted = job_service.submit_job(
        payload=bad_payload,
        default_partition=None,
        batch_size=2,
        max_retries=1,
        time_windows_hours=[1],
    )

    with db_session_factory() as session:
        response = job_service.get_job_response(session, accepted.job_id)

    assert response is not None
    assert response.status == "failed"
    assert response.result is None
    assert response.error_message is not None
