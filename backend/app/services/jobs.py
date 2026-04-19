from __future__ import annotations

from concurrent.futures import Executor, ThreadPoolExecutor
from uuid import uuid4

from sqlalchemy.orm import Session, sessionmaker

from app.models import AnalysisJob, utcnow
from app.schemas import AnalysisJobAcceptedResponse, AnalysisJobResponse, UploadAnalysisResponse
from app.services.pipeline import FraudPipelineService


class AnalysisJobService:
    def __init__(
        self,
        *,
        session_factory: sessionmaker,
        pipeline: FraudPipelineService,
        executor: Executor | None = None,
    ):
        self.session_factory = session_factory
        self.pipeline = pipeline
        self.executor = executor or ThreadPoolExecutor(max_workers=2, thread_name_prefix="analysis-job")

    def submit_job(
        self,
        *,
        payload: bytes,
        default_partition: str | None,
        batch_size: int | None,
        max_retries: int | None,
        time_windows_hours: list[int],
    ) -> AnalysisJobAcceptedResponse:
        job_id = str(uuid4())
        submitted_at = utcnow()

        session = self.session_factory()
        try:
            session.add(
                AnalysisJob(
                    id=job_id,
                    status="queued",
                    request_params={
                        "default_partition": default_partition,
                        "batch_size": batch_size,
                        "max_retries": max_retries,
                        "time_windows_hours": time_windows_hours,
                    },
                    submitted_at=submitted_at,
                )
            )
            session.commit()
        finally:
            session.close()

        self.executor.submit(
            self._run_job,
            job_id,
            payload,
            default_partition,
            batch_size,
            max_retries,
            time_windows_hours,
        )
        return AnalysisJobAcceptedResponse(job_id=job_id, status="queued", submitted_at=submitted_at)

    def get_job_response(self, session: Session, job_id: str) -> AnalysisJobResponse | None:
        job = session.get(AnalysisJob, job_id)
        if job is None:
            return None

        result = None
        if job.result is not None:
            result = UploadAnalysisResponse.model_validate(job.result)

        return AnalysisJobResponse(
            job_id=job.id,
            status=job.status,
            submitted_at=job.submitted_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            error_message=job.error_message,
            result=result,
        )

    def _run_job(
        self,
        job_id: str,
        payload: bytes,
        default_partition: str | None,
        batch_size: int | None,
        max_retries: int | None,
        time_windows_hours: list[int],
    ) -> None:
        session = self.session_factory()
        try:
            job = session.get(AnalysisJob, job_id)
            if job is None:
                return

            job.status = "running"
            job.started_at = utcnow()
            session.commit()

            result = self.pipeline.process_upload(
                session,
                payload,
                default_partition=default_partition,
                batch_size=batch_size,
                max_retries=max_retries,
                time_windows_hours=time_windows_hours,
            )
            serialized_result = UploadAnalysisResponse.model_validate(result).model_dump(mode="json")

            job = session.get(AnalysisJob, job_id)
            if job is None:
                return
            job.status = "completed"
            job.result = serialized_result
            job.error_message = None
            job.completed_at = utcnow()
            session.commit()
        except Exception as exc:
            session.rollback()
            failed_session = self.session_factory()
            try:
                job = failed_session.get(AnalysisJob, job_id)
                if job is None:
                    return
                job.status = "failed"
                job.error_message = str(exc)
                job.completed_at = utcnow()
                failed_session.commit()
            finally:
                failed_session.close()
        finally:
            session.close()
