from sqlalchemy.orm import Session

from app.config import Settings
from app.services.detection import DetectionService
from app.services.ingestion import IngestionService


class FraudPipelineService:
    def __init__(
        self,
        settings: Settings,
        ingestion_service: IngestionService | None = None,
        detection_service: DetectionService | None = None,
    ):
        self.settings = settings
        self.ingestion_service = ingestion_service or IngestionService()
        self.detection_service = detection_service or DetectionService()

    def process_upload(
        self,
        session: Session,
        payload: bytes,
        *,
        default_partition: str | None,
        batch_size: int | None = None,
        max_retries: int | None = None,
        time_windows_hours: list[int] | None = None,
    ) -> dict:
        inserted_by_partition = self.ingestion_service.ingest_csv(
            session,
            payload,
            default_partition=default_partition,
            batch_size=batch_size or self.settings.batch_size,
            max_retries=max_retries or self.settings.max_retries,
            retry_backoff_seconds=self.settings.retry_backoff_seconds,
        )

        partition_summaries = []
        for source_partition, processed_records in sorted(inserted_by_partition.items()):
            result = self.detection_service.analyze_partition(
                session,
                source_partition=source_partition,
                time_windows_hours=time_windows_hours or self.settings.parsed_time_windows,
                zscore_threshold=self.settings.zscore_threshold,
                velocity_threshold=self.settings.velocity_threshold,
                amount_ratio_threshold=self.settings.amount_ratio_threshold,
            )
            result["processed_records"] = processed_records
            partition_summaries.append(result)

        total_alerts = sum(summary["alert_count"] for summary in partition_summaries)
        return {
            "processed_partitions": len(partition_summaries),
            "processed_records": sum(inserted_by_partition.values()),
            "total_alerts": total_alerts,
            "partitions": partition_summaries,
        }

