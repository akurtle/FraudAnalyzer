from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str):
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, future=True, echo=False, connect_args=connect_args)


def build_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


engine = build_engine(get_settings().database_url)
SessionLocal = build_session_factory(engine)


def init_db() -> None:
    from app import models

    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility()


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("analysis_jobs"):
        return

    columns = {column["name"] for column in inspector.get_columns("analysis_jobs")}
    if "analysis_run_id" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE analysis_jobs ADD COLUMN analysis_run_id VARCHAR(36)"))
