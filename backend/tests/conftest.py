"""测试隔离：每个 client fixture 用独立内存 SQLite，并自行 seed admin + 比例表 v1。
通过依赖注入覆盖 get_db，使所有路由的 DB 操作都走测试库，不碰持久化 salary.db。"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.main import app
from backend.app.db import Base, get_db, User
from backend.app.auth import hash_password
from backend.app.config import DEFAULT_ADMIN


def _seed(db):
    if not db.query(User).first():
        db.add(User(username=DEFAULT_ADMIN["username"],
                    password_hash=hash_password(DEFAULT_ADMIN["password"])))
    db.commit()


@pytest.fixture
def db_session():
    """每个测试独立的内存 SQLite 共享会话。

    同一个 Session 对象同时供 client（经 get_db 依赖注入覆盖）和测试代码直查使用，
    保证测试在调用 /compute 之后能立刻读到路由 commit 的 Result/DetailRow 行。
    StaticPool 共享单连接，保证内存库在请求间持续存在。
    """
    test_engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(test_engine)
    session = TestSession()
    _seed(session)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(test_engine)


@pytest.fixture
def client(db_session):
    """复用 db_session 的共享会话，保证路由与测试看到同一份数据。"""
    def _override_get_db():
        # 不在请求结束时关闭会话——会话生命周期由 db_session fixture 管理
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
