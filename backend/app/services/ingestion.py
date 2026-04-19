from __future__ import annotations

import io
import time
from collections import defaultdict

import pandas as pd
from sqlalchemy.orm import Session

from app.services.repository import FraudRepository


REQUIRED_COLUMNS = {
    "transaction_id",
    "account_id",
    "merchant_id",
    "amount",
    "event_ts",
}


class IngestionService:
    def __init__(self, repository: FraudRepository | None = None):
        self.repository = repository or FraudRepository()

    def ingest_csv(
        self,
        session: Session,
        payload: bytes,
        *,
        default_partition: str | None,
        batch_size: int,
        max_retries: int,
        retry_backoff_seconds: float,
    ) -> dict[str, int]:
        dataframe = pd.read_csv(io.BytesIO(payload))
        dataframe.columns = [column.strip().lower() for column in dataframe.columns]
        missing_columns = REQUIRED_COLUMNS.difference(dataframe.columns)
        if missing_columns:
            raise ValueError(f"Missing required columns: {', '.join(sorted(missing_columns))}")

        if "source_partition" not in dataframe.columns:
            if not default_partition:
                raise ValueError("Provide a source partition or include source_partition in the CSV.")
            dataframe["source_partition"] = default_partition
        elif default_partition:
            dataframe["source_partition"] = default_partition

        dataframe["transaction_id"] = dataframe["transaction_id"].astype(str).str.strip()
        dataframe["account_id"] = dataframe["account_id"].astype(str).str.strip()
        dataframe["merchant_id"] = dataframe["merchant_id"].astype(str).str.strip()
        dataframe["source_partition"] = dataframe["source_partition"].astype(str).str.strip()
        dataframe["amount"] = pd.to_numeric(dataframe["amount"], errors="raise")
        dataframe["event_ts"] = pd.to_datetime(dataframe["event_ts"], utc=True, errors="raise")

        for optional_column in ("country_code", "device_id", "status"):
            if optional_column not in dataframe.columns:
                dataframe[optional_column] = None

        dataframe = dataframe.dropna(subset=["transaction_id", "account_id", "merchant_id", "source_partition"])
        dataframe = dataframe.drop_duplicates(
            subset=["source_partition", "transaction_id"],
            keep="last",
        )

        records = []
        for row in dataframe.to_dict(orient="records"):
            row["event_ts"] = row["event_ts"].to_pydatetime()
            records.append(row)

        inserted_by_partition: dict[str, int] = defaultdict(int)
        for index in range(0, len(records), batch_size):
            batch = records[index : index + batch_size]
            inserted_count = self._persist_with_retry(
                session=session,
                batch=batch,
                max_retries=max_retries,
                retry_backoff_seconds=retry_backoff_seconds,
            )
            batch_partitions = defaultdict(int)
            for record in batch:
                batch_partitions[record["source_partition"]] += 1

            if inserted_count == len(batch):
                for partition, count in batch_partitions.items():
                    inserted_by_partition[partition] += count
            else:
                for record in batch:
                    partition = record["source_partition"]
                    inserted_by_partition[partition] += 1

        return dict(inserted_by_partition)

    def _persist_with_retry(
        self,
        *,
        session: Session,
        batch: list[dict],
        max_retries: int,
        retry_backoff_seconds: float,
    ) -> int:
        attempt = 0
        while True:
            attempt += 1
            try:
                inserted_count = self.repository.persist_transactions_batch(session, batch)
                session.commit()
                return inserted_count
            except Exception:
                session.rollback()
                if attempt >= max_retries:
                    raise
                time.sleep(retry_backoff_seconds * attempt)

