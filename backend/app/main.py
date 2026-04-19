from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session, init_db
from app.schemas import HealthResponse, PartitionSummaryResponse, UploadAnalysisResponse
from app.services.detection import DetectionService
from app.services.pipeline import FraudPipelineService
from app.services.repository import FraudRepository


def parse_time_windows(raw_value: str | None, settings: Settings) -> list[int]:
    if not raw_value:
        return settings.parsed_time_windows
    return [int(value.strip()) for value in raw_value.split(",") if value.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    repository = FraudRepository()
    detection_service = DetectionService(repository=repository)
    pipeline = FraudPipelineService(settings=settings, detection_service=detection_service)

    @app.get("/api/health", response_model=HealthResponse)
    def healthcheck() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.post("/api/analyze/upload", response_model=UploadAnalysisResponse)
    async def analyze_upload(
        file: UploadFile = File(...),
        source_partition: str | None = Form(default=None),
        batch_size: int | None = Form(default=None),
        max_retries: int | None = Form(default=None),
        time_windows: str | None = Form(default=None),
        session: Session = Depends(get_session),
    ) -> UploadAnalysisResponse:
        if not file.filename or not file.filename.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Upload a CSV file containing transactions.")

        payload = await file.read()
        try:
            result = pipeline.process_upload(
                session,
                payload,
                default_partition=source_partition,
                batch_size=batch_size,
                max_retries=max_retries,
                time_windows_hours=parse_time_windows(time_windows, settings),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc

        return UploadAnalysisResponse.model_validate(result)

    @app.get("/api/partitions", response_model=list[str])
    def list_partitions(session: Session = Depends(get_session)) -> list[str]:
        return repository.list_partitions(session)

    @app.get("/api/partitions/{source_partition}/summary", response_model=PartitionSummaryResponse)
    def partition_summary(
        source_partition: str,
        session: Session = Depends(get_session),
    ) -> PartitionSummaryResponse:
        result = detection_service.analyze_partition(
            session,
            source_partition=source_partition,
            time_windows_hours=settings.parsed_time_windows,
            zscore_threshold=settings.zscore_threshold,
            velocity_threshold=settings.velocity_threshold,
            amount_ratio_threshold=settings.amount_ratio_threshold,
        )
        result["processed_records"] = result["transaction_count"]
        return PartitionSummaryResponse.model_validate(result)

    frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    return app


app = create_app()

