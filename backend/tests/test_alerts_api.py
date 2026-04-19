from fastapi.testclient import TestClient

from app.main import app


def test_alert_filters_and_status_updates():
    with TestClient(app) as client:
        with open(r"C:\Projects\FraudAnalyzer\sample_data\demo_transactions.csv", "rb") as handle:
            accepted = client.post(
                "/api/analyze/upload",
                files={"file": ("demo_transactions.csv", handle, "text/csv")},
            )
        assert accepted.status_code == 202
        job_payload = accepted.json()

        for _ in range(20):
            job_response = client.get(f"/api/jobs/{job_payload['job_id']}")
            assert job_response.status_code == 200
            if job_response.json()["status"] == "completed":
                break
        else:
            assert False, "Expected analysis job to complete"

        alerts_response = client.get("/api/alerts", params={"source_partition": "tenant-a"})
        assert alerts_response.status_code == 200
        alerts = alerts_response.json()
        assert len(alerts) >= 1
        first_alert = alerts[0]
        assert first_alert["analyst_status"] == "open"

        update_response = client.patch(
            f"/api/alerts/{first_alert['id']}",
            json={"analyst_status": "reviewed"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["analyst_status"] == "reviewed"

        filtered_reviewed = client.get("/api/alerts", params={"analyst_status": "reviewed"})
        assert filtered_reviewed.status_code == 200
        reviewed_alerts = filtered_reviewed.json()
        assert any(alert["id"] == first_alert["id"] for alert in reviewed_alerts)
