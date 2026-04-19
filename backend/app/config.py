from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Fraud Pattern Analyzer"
    database_url: str = Field(
        default="sqlite:///./fraud_analyzer.db",
        alias="DATABASE_URL",
    )
    batch_size: int = Field(default=250, alias="BATCH_SIZE")
    max_retries: int = Field(default=3, alias="MAX_RETRIES")
    retry_backoff_seconds: float = Field(default=0.25, alias="RETRY_BACKOFF_SECONDS")
    time_windows_hours: str = Field(default="1,24,72", alias="TIME_WINDOWS_HOURS")
    zscore_threshold: float = Field(default=2.5, alias="ZSCORE_THRESHOLD")
    velocity_threshold: int = Field(default=5, alias="VELOCITY_THRESHOLD")
    amount_ratio_threshold: float = Field(default=3.0, alias="AMOUNT_RATIO_THRESHOLD")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def parsed_time_windows(self) -> list[int]:
        values = [value.strip() for value in self.time_windows_hours.split(",")]
        return [int(value) for value in values if value]


@lru_cache
def get_settings() -> Settings:
    return Settings()

