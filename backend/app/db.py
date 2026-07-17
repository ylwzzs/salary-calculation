"""SQLAlchemy 模型与会话（规格 §4 数据模型）。"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date, DateTime, JSON,
    UniqueConstraint, ForeignKey, create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

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
    exclude_commission = Column(Boolean, default=False)  # 不计入提成


class Store(Base):
    __tablename__ = "stores"
    name = Column(String, primary_key=True)
    group = Column(String)               # 1组 | 2组 | 3组
    store_class = Column(String)         # A | B | C | D
    supervisor = Column(String, default="")
    exclude_assessment = Column(Boolean, default=False)  # 不参与考核


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


class SalaryPolicyVersion(Base):
    __tablename__ = "salary_policy_versions"

    id = Column(Integer, primary_key=True)
    version = Column(Integer, nullable=False, unique=True)
    effective_from = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(50))
    content = Column(JSON, nullable=False)
    note = Column(String(200))


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


class Month(Base):
    __tablename__ = "months"
    month = Column(String, primary_key=True)     # YYYY-MM
    status = Column(String, default="draft")     # draft | computed
    sales_file = Column(String, nullable=True)   # 上传的销售流水路径
    gifts_file = Column(String, nullable=True)   # 上传的让利明细路径
    rate_version_id = Column(Integer, nullable=True)  # 计算时锁定的比例表版本
    policy_version_id = Column(Integer, ForeignKey("salary_policy_versions.id"), nullable=True)
    policy_version = relationship("SalaryPolicyVersion")
    current_step = Column(String(20), default="import")  # import/targets/duty/results
    step_data = Column(JSON, default=dict)  # 步骤数据快照
    created_at = Column(DateTime, default=datetime.utcnow)


class Duty(Base):
    __tablename__ = "duties"
    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False)
    store = Column(String, nullable=False)
    duty_date = Column(Date, nullable=False)
    salesperson = Column(String, nullable=False)  # 确认的当班人
    __table_args__ = (UniqueConstraint("month", "store", "duty_date", name="uq_duty"),)


class Result(Base):
    __tablename__ = "results"
    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False)
    person = Column(String, nullable=False)
    store = Column(String, nullable=False)
    sales = Column(Numeric, nullable=False)
    target = Column(Numeric, nullable=False)
    achievement = Column(Numeric, nullable=False)
    bucket = Column(String, nullable=False)
    commission = Column(Numeric, nullable=False)
    __table_args__ = (UniqueConstraint("month", "person", "store", name="uq_result"),)


class Anomaly(Base):
    """计算预检异常记录"""
    __tablename__ = "anomalies"
    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False, index=True)  # YYYY-MM
    anomaly_type = Column(String(10), nullable=False)  # 1-6
    entity_type = Column(String(50))  # store/product/gift/refund
    entity_id = Column(String(100))  # 门店名/条码等
    description = Column(String(500))
    status = Column(String(20), default="pending")  # pending/ignored/resolved
    resolution = Column(String(200))
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
