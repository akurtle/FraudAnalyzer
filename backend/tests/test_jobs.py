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
        source_file_name="success.csv",
        default_partition=None,
        batch_size=2,
        max_retries=1,
        time_windows_hours=[1],
    )

    with db_session_factory() as session:
        response = job_service.get_job_response(session, accepted.job_id)
        run_response = job_service.get_run_response(session, accepted.run_id)

    assert response is not None
    assert response.status == "completed"
    assert response.run_id == accepted.run_id
    assert response.result is not None
    assert response.result.processed_partitions == 1
    assert response.result.total_alerts >= 1
    assert run_response is not None
    assert run_response.status == "completed"
    assert run_response.processed_partitions == 1
    assert run_response.total_alerts is not None
    assert run_response.duration_ms is not None


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
        source_file_name="failure.csv",
        default_partition=None,
        batch_size=2,
        max_retries=1,
        time_windows_hours=[1],
    )

    with db_session_factory() as session:
        response = job_service.get_job_response(session, accepted.job_id)
        run_response = job_service.get_run_response(session, accepted.run_id)

    assert response is not None
    assert response.status == "failed"
    assert response.result is None
    assert response.error_message is not None
    assert run_response is not None
    assert run_response.status == "failed"
    assert run_response.error_message is not None


def test_analysis_runs_are_listed_with_latest_first(db_session_factory):
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
tx-2,acct-1,merchant-1,11.00,2026-01-01T00:05:00Z,tenant-a
tx-3,acct-1,merchant-1,120.00,2026-01-01T00:10:00Z,tenant-a
"""

    first = job_service.submit_job(
        payload=payload,
        source_file_name="first.csv",
        default_partition=None,
        batch_size=2,
        max_retries=1,
        time_windows_hours=[1],
    )
    second = job_service.submit_job(
        payload=payload,
        source_file_name="second.csv",
        default_partition=None,
        batch_size=2,
        max_retries=1,
        time_windows_hours=[1],
    )

    with db_session_factory() as session:
        runs = job_service.list_runs(session, limit=5)

    assert runs[0].run_id == second.run_id
    assert runs[1].run_id == first.run_id
