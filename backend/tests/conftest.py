from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app import models
from app.database import Base, build_engine, build_session_factory


@pytest.fixture()
def db_session(tmp_path: Path) -> Generator[Session, None, None]:
    database_url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = build_engine(database_url)
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def db_session_factory(tmp_path: Path):
    database_url = f"sqlite:///{tmp_path / 'jobs.db'}"
    engine = build_engine(database_url)
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)
    try:
        yield session_factory
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
