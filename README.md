# Fraud Pattern Analyzer

Fraud Pattern Analyzer is a full-stack portfolio project that ingests anonymized transaction
records, stores them in PostgreSQL, and runs partition-aware anomaly detection over
configurable time windows. The UI is intentionally lightweight, while the backend focuses on
batch safety, retry behavior, partition isolation, and test coverage.

## Stack

- Backend: Python, FastAPI, SQLAlchemy, Pandas
- Database: PostgreSQL, with Supabase-compatible connection support
- Frontend: Astro + React, built to static assets and served by FastAPI
- Testing: PyTest
- Data model: `transactions` and `fraud_alerts` tables with partition-aware uniqueness rules

## Core Features

- Batch CSV ingestion with configurable batch size and retry logic
- Partition isolation through `source_partition`-scoped storage and analysis
- Rolling anomaly detection for:
  - transaction velocity spikes
  - abnormal amount spikes using median and z-score comparisons
- Persisted alert records for downstream review and auditability
- Simple browser UI for uploading transaction files and reviewing suspicious events

## Architecture

Detailed design notes live in [docs/architecture.md](/C:/Projects/FraudAnalyzer/docs/architecture.md).

High-level flow:

1. The frontend uploads a CSV batch to the FastAPI API.
2. The ingestion layer validates required columns and normalizes records.
3. Records are written to PostgreSQL in configurable chunks with retry handling.
4. Pandas loads partition-scoped transaction histories and computes fraud signals per
   partition.
5. Fraud alerts are stored in the database and returned to the UI.

## Local Setup

### 1. Start PostgreSQL

Use either Supabase or the included local PostgreSQL service:

- Supabase:
  - Create a project and copy its PostgreSQL connection string.
  - Set `DATABASE_URL` in `backend/.env`.
- Local Docker PostgreSQL:
  - Run `docker compose up -d`
  - Use `postgresql+psycopg://postgres:postgres@localhost:5432/fraud_analyzer`

### 2. Configure the backend

From `C:\Projects\FraudAnalyzer\backend`:

```powershell
Copy-Item .env.example .env
```

Update `DATABASE_URL` if you want to point to Supabase instead of local PostgreSQL.

### 3. Install dependencies

Backend dependencies:

```powershell
pip install -r requirements.txt
```

Frontend dependencies:

From `C:\Projects\FraudAnalyzer\frontend`:

```powershell
npm install
```

### 4. Build the frontend

From `C:\Projects\FraudAnalyzer\frontend`:

```powershell
npm run build
```

For frontend-only development you can also run:

```powershell
npm run dev
```

### 5. Run the application

From `C:\Projects\FraudAnalyzer\backend`:

```powershell
uvicorn app.main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Test Suite

From `C:\Projects\FraudAnalyzer\backend`:

```powershell
pytest -q
```

The suite covers:

- retry behavior during batch ingestion
- missing partition edge cases
- anomaly detection behavior
- regression coverage for partition isolation
- end-to-end pipeline summaries

## Demo Data

Use [sample_data/demo_transactions.csv](/C:/Projects/FraudAnalyzer/sample_data/demo_transactions.csv)
to test the upload flow quickly.

## Project Layout

- `backend/app/` API, data models, and pipeline services
- `backend/tests/` PyTest coverage
- `frontend/src/` Astro pages, React components, styles, and client utilities
- `frontend/dist/` built frontend assets served by FastAPI after `npm run build`
- `sample_data/` sample transaction batch
- `docs/` architecture and design notes

