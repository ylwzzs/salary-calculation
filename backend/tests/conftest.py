"""测试隔离：每个 client fixture 用独立内存 SQLite，并自行 seed admin + 比例表 v1。
通过依赖注入覆盖 get_db，使所有路由的 DB 操作都走测试库，不碰持久化 salary.db。"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.main import app
from backend.app.db import Base, get_db, User, RateVersion
from backend.app.auth import hash_password
from backend.app.config import DEFAULT_ADMIN


def _seed(db):
    from salary_engine.rates import seed_rate_table as _seed_rates
    if not db.query(User).first():
        db.add(User(username=DEFAULT_ADMIN["username"],
                    password_hash=hash_password(DEFAULT_ADMIN["password"])))
    if not db.query(RateVersion).first():
        rt = _seed_rates()
        nested = {}
        for (cls, bucket, tier), pct in rt.rates.items():
            nested.setdefault(cls, {}).setdefault(bucket, {})[tier] = str(pct)
        db.add(RateVersion(version=1, effective_from=rt.effective_from,
                           is_current=True, rates=nested))
    db.commit()


@pytest.fixture
def client():
    # StaticPool 共享单连接，保证内存库在请求间持续存在
    test_engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(test_engine)
    with TestSession() as s:
        _seed(s)

    def _override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(test_engine)
