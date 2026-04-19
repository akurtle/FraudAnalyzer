from __future__ import annotations

from concurrent.futures import Executor, ThreadPoolExecutor
from uuid import uuid4

from sqlalchemy.orm import Session, sessionmaker

from app.models import AnalysisJob, AnalysisRun, utcnow
from app.schemas import (
    AnalysisJobAcceptedResponse,
    AnalysisJobResponse,
    AnalysisRunResponse,
    UploadAnalysisResponse,
)
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
        source_file_name: str | None,
        default_partition: str | None,
        batch_size: int | None,
        max_retries: int | None,
        time_windows_hours: list[int],
    ) -> AnalysisJobAcceptedResponse:
        job_id = str(uuid4())
        run_id = str(uuid4())
        submitted_at = utcnow()
        request_params = {
            "default_partition": default_partition,
            "batch_size": batch_size,
            "max_retries": max_retries,
            "time_windows_hours": time_windows_hours,
        }

        session = self.session_factory()
        try:
            session.add(
                AnalysisRun(
                    id=run_id,
                    job_id=job_id,
                    source_file_name=source_file_name,
                    status="queued",
                    parameters=request_params,
                    submitted_at=submitted_at,
                )
            )
            session.add(
                AnalysisJob(
                    id=job_id,
                    analysis_run_id=run_id,
                    status="queued",
                    request_params=request_params
                    | {"current_stage": "queued", "progress_percentage": 0},
                    submitted_at=submitted_at,
                )
            )
            session.commit()
        finally:
            session.close()

        self.executor.submit(
            self._run_job,
            job_id,
            run_id,
            payload,
            default_partition,
            batch_size,
            max_retries,
            time_windows_hours,
        )
        return AnalysisJobAcceptedResponse(
            job_id=job_id,
            run_id=run_id,
            status="queued",
            submitted_at=submitted_at,
        )

    def get_job_response(self, session: Session, job_id: str) -> AnalysisJobResponse | None:
        job = session.get(AnalysisJob, job_id)
        if job is None:
            return None

        result = None
        if job.result is not None:
            result = UploadAnalysisResponse.model_validate(job.result)

        return AnalysisJobResponse(
            job_id=job.id,
            run_id=job.analysis_run_id,
            status=job.status,
            current_stage=job.request_params.get("current_stage"),
            progress_percentage=job.request_params.get("progress_percentage"),
            submitted_at=job.submitted_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            error_message=job.error_message,
            result=result,
        )

    def get_run_response(self, session: Session, run_id: str) -> AnalysisRunResponse | None:
        run = session.get(AnalysisRun, run_id)
        if run is None:
            return None
        return AnalysisRunResponse(
            run_id=run.id,
            job_id=run.job_id,
            source_file_name=run.source_file_name,
            status=run.status,
            parameters=run.parameters,
            processed_partitions=run.processed_partitions,
            processed_records=run.processed_records,
            total_alerts=run.total_alerts,
            duration_ms=run.duration_ms,
            summary=run.summary,
            error_message=run.error_message,
            submitted_at=run.submitted_at,
            started_at=run.started_at,
            completed_at=run.completed_at,
        )

    def list_runs(self, session: Session, limit: int = 10) -> list[AnalysisRunResponse]:
        rows = (
            session.query(AnalysisRun)
            .order_by(AnalysisRun.submitted_at.desc())
            .limit(limit)
            .all()
        )
        return [self.get_run_response(session, run.id) for run in rows if run is not None]

    def _run_job(
        self,
        job_id: str,
        run_id: str,
        payload: bytes,
        default_partition: str | None,
        batch_size: int | None,
        max_retries: int | None,
        time_windows_hours: list[int],
    ) -> None:
        session = self.session_factory()
        try:
            job = session.get(AnalysisJob, job_id)
            run = session.get(AnalysisRun, run_id)
            if job is None or run is None:
                return

            started_at = utcnow()
            job.status = "running"
            job.started_at = started_at
            self._set_job_progress(session, job, "starting_job", 5, commit=False)
            run.status = "running"
            run.started_at = started_at
            session.commit()

            result = self.pipeline.process_upload(
                session,
                payload,
                default_partition=default_partition,
                batch_size=batch_size,
                max_retries=max_retries,
                time_windows_hours=time_windows_hours,
                progress_callback=lambda stage, percentage: self._update_job_progress(
                    job_id,
                    stage,
                    percentage,
                ),
            )
            serialized_result = UploadAnalysisResponse.model_validate(result).model_dump(mode="json")

            job = session.get(AnalysisJob, job_id)
            run = session.get(AnalysisRun, run_id)
            if job is None or run is None:
                return
            completed_at = utcnow()
            job.status = "completed"
            job.result = serialized_result
            job.error_message = None
            job.completed_at = completed_at
            self._set_job_progress(session, job, "completed", 100, commit=False)
            run.status = "completed"
            run.processed_partitions = result["processed_partitions"]
            run.processed_records = result["processed_records"]
            run.total_alerts = result["total_alerts"]
            run.summary = serialized_result
            run.error_message = None
            run.completed_at = completed_at
            if run.started_at is not None:
                run.duration_ms = self._duration_ms(run.started_at, completed_at)
            session.commit()
        except Exception as exc:
            session.rollback()
            failed_session = self.session_factory()
            try:
                job = failed_session.get(AnalysisJob, job_id)
                run = failed_session.get(AnalysisRun, run_id)
                if job is None or run is None:
                    return
                completed_at = utcnow()
                job.status = "failed"
                job.error_message = str(exc)
                job.completed_at = completed_at
                self._set_job_progress(failed_session, job, "failed", 100, commit=False)
                run.status = "failed"
                run.error_message = str(exc)
                run.completed_at = completed_at
                if run.started_at is not None:
                    run.duration_ms = self._duration_ms(run.started_at, completed_at)
                failed_session.commit()
            finally:
                failed_session.close()
        finally:
            session.close()

    def _duration_ms(self, started_at, completed_at) -> int:
        if getattr(started_at, "tzinfo", None) is None:
            completed_at = completed_at.replace(tzinfo=None)
        return int((completed_at - started_at).total_seconds() * 1000)

    def _update_job_progress(self, job_id: str, stage: str, percentage: int) -> None:
        session = self.session_factory()
        try:
            job = session.get(AnalysisJob, job_id)
            if job is None:
                return
            self._set_job_progress(session, job, stage, percentage, commit=True)
        finally:
            session.close()

    def _set_job_progress(
        self,
        session: Session,
        job: AnalysisJob,
        stage: str,
        percentage: int,
        *,
        commit: bool,
    ) -> None:
        job.request_params = dict(job.request_params) | {
            "current_stage": stage,
            "progress_percentage": percentage,
        }
        if commit:
            session.commit()
