from sqlalchemy.orm import Session

from app.services.ingestion import IngestionService
from app.services.detection import DetectionService


def test_detection_flags_amount_and_velocity_spikes(db_session: Session):
    service = IngestionService()
    detection = DetectionService()
    payload = b"""transaction_id,account_id,merchant_id,amount,event_ts,source_partition
tx-1,acct-1,merchant-1,10.00,2026-01-01T00:00:00Z,tenant-a
tx-2,acct-1,merchant-1,12.00,2026-01-01T00:10:00Z,tenant-a
tx-3,acct-1,merchant-1,11.00,2026-01-01T00:20:00Z,tenant-a
tx-4,acct-1,merchant-1,13.00,2026-01-01T00:30:00Z,tenant-a
tx-5,acct-1,merchant-1,250.00,2026-01-01T00:40:00Z,tenant-a
"""

    service.ingest_csv(
        db_session,
        payload,
        default_partition=None,
        batch_size=10,
        max_retries=1,
        retry_backoff_seconds=0,
    )
    result = detection.analyze_partition(
        db_session,
        source_partition="tenant-a",
        time_windows_hours=[1],
        zscore_threshold=1.2,
        velocity_threshold=4,
        amount_ratio_threshold=3.0,
    )

    assert result["transaction_count"] == 5
    assert result["alert_count"] >= 2
    assert "velocity_spike" in result["rules_triggered"]
    assert "amount_spike" in result["rules_triggered"]
    explanations = [alert.details["explanation"] for alert in result["alerts"]]
    assert any("exceeded the threshold" in explanation for explanation in explanations)
    assert any("recent median" in explanation for explanation in explanations)
    assert all(alert.details["analyst_status"] == "open" for alert in result["alerts"])


def test_detection_preserves_partition_isolation(db_session: Session):
    service = IngestionService()
    detection = DetectionService()
    payload = b"""transaction_id,account_id,merchant_id,amount,event_ts,source_partition
tx-1,acct-1,merchant-1,10.00,2026-01-01T00:00:00Z,tenant-a
tx-2,acct-1,merchant-1,10.00,2026-01-01T00:05:00Z,tenant-a
tx-3,acct-1,merchant-1,10.00,2026-01-01T00:10:00Z,tenant-a
tx-4,acct-1,merchant-1,200.00,2026-01-01T00:15:00Z,tenant-b
"""

    service.ingest_csv(
        db_session,
        payload,
        default_partition=None,
        batch_size=10,
        max_retries=1,
        retry_backoff_seconds=0,
    )
    tenant_a = detection.analyze_partition(
        db_session,
        source_partition="tenant-a",
        time_windows_hours=[1],
        zscore_threshold=1.0,
        velocity_threshold=5,
        amount_ratio_threshold=2.0,
    )
    tenant_b = detection.analyze_partition(
        db_session,
        source_partition="tenant-b",
        time_windows_hours=[1],
        zscore_threshold=1.0,
        velocity_threshold=2,
        amount_ratio_threshold=2.0,
    )

    assert tenant_a["alert_count"] == 0
    assert tenant_b["alert_count"] == 0
