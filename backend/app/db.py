"""SQLAlchemy 模型与会话（规格 §4 数据模型）。"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date, DateTime, JSON,
    UniqueConstraint, create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.app.config import DB_URL

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)


class Product(Base):
    __tablename__ = "products"
    barcode = Column(String, primary_key=True)
    name = Column(String)
    spec = Column(String)
    category = Column(String)            # 常温奶 | 低温奶
    cost = Column(Numeric, nullable=True)  # 销售成本，匹配不到为 None


class Store(Base):
    __tablename__ = "stores"
    name = Column(String, primary_key=True)
    group = Column(String)               # 1组 | 2组 | 3组
    store_class = Column(String)         # A | B | C | D
    supervisor = Column(String, default="")


class MonthlyTarget(Base):
    __tablename__ = "monthly_targets"
    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False)    # YYYY-MM
    store = Column(String, nullable=False)
    target = Column(Numeric, nullable=False)
    __table_args__ = (UniqueConstraint("month", "store", name="uq_month_store"),)


class RateVersion(Base):
    __tablename__ = "rate_versions"
    id = Column(Integer, primary_key=True)
    version = Column(Integer, nullable=False)
    effective_from = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False)
    rates = Column(JSON, nullable=False)  # {cls: {bucket: {tier: 百分数字符串}}}
    created_at = Column(DateTime, default=datetime.utcnow)


engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
