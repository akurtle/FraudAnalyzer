from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AlertResponse(BaseModel):
    id: int
    source_partition: str
    transaction_id: str
    account_id: str
    merchant_id: str
    rule_name: str
    severity: str
    analyst_status: str
    score: float
    window_hours: int
    details: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PartitionSummaryResponse(BaseModel):
    source_partition: str
    processed_records: int
    transaction_count: int
    alert_count: int
    rules_triggered: dict[str, int]
    alerts: list[AlertResponse]


class UploadAnalysisResponse(BaseModel):
    processed_partitions: int
    processed_records: int
    total_alerts: int
    partitions: list[PartitionSummaryResponse]


class HealthResponse(BaseModel):
    status: str


class AnalysisJobAcceptedResponse(BaseModel):
    job_id: str
    run_id: str
    status: str
    submitted_at: datetime


class AnalysisJobResponse(BaseModel):
    job_id: str
    run_id: str | None = None
    status: str
    submitted_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    result: UploadAnalysisResponse | None = None


class AnalysisRunResponse(BaseModel):
    run_id: str
    job_id: str | None = None
    source_file_name: str | None = None
    status: str
    parameters: dict
    processed_partitions: int | None = None
    processed_records: int | None = None
    total_alerts: int | None = None
    duration_ms: int | None = None
    summary: dict | None = None
    error_message: str | None = None
    submitted_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


class AlertStatusUpdateRequest(BaseModel):
    analyst_status: str
