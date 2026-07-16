# Web 后端地基 Implementation Plan (Plan 2a / 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭起 FastAPI + SQLite 后端：应用骨架、数据库模型、账号密码登录、主数据(商品/门店/比例表版本/月度目标)的增查改与 Excel 导入。这是后续 2b（月度流程：导入销售/当班/计算/结果）的地基。

**Architecture:** `backend/` 目录下一个 FastAPI 应用，复用根包 `salary_engine`（已 editable 安装）。SQLAlchemy + SQLite 存主数据；stdlib `hashlib` 做密码哈希、`itsdangerous` 签发登录令牌。一个 venv 装全套（根 pyproject 加 `web` extra）。

**Tech Stack:** FastAPI、Uvicorn、SQLAlchemy 2.x、SQLite、itsdangerous、python-multipart、pytest + httpx（TestClient）。

**对应规格：** `docs/superpowers/specs/2026-07-14-milk-commission-system-design.md`（§4 数据模型、§5 架构）

---

## File Structure

```
salary_calculation/
├── pyproject.toml              # 修改：加 [web] extra
├── backend/
│   ├── __init__.py
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             # FastAPI app + CORS + 挂载路由 + 启动初始化
│   │   ├── config.py           # 配置(DB路径、令牌密钥、默认管理员)
│   │   ├── db.py               # SQLAlchemy engine/session + Base + 全部模型
│   │   ├── auth.py             # 密码哈希、令牌、login、get_current_user
│   │   ├── schemas.py          # pydantic 模型(各路由的入参出参)
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── products.py     # 商品档案
│   │       ├── stores.py       # 门店信息 + 按组批量改类别
│   │       ├── rates.py        # 比例表版本管理
│   │       ├── targets.py      # 月度目标
│   │       └── import_master.py# 主数据 Excel 导入
│   └── tests/
│       ├── conftest.py         # 内存DB TestClient fixtures
│       ├── test_health.py
│       ├── test_auth.py
│       ├── test_products.py
│       ├── test_stores.py
│       ├── test_rates.py
│       ├── test_targets.py
│       └── test_import_master.py
```

每个文件单一职责：`db.py` 只管模型与会话；`auth.py` 只管鉴权；每个 router 一个主数据域；`schemas.py` 集中 pydantic 定义。

---

## Task 1: 后端骨架与 /health

**Files:**
- Modify: `pyproject.toml`
- Create: `backend/__init__.py`, `backend/app/__init__.py`, `backend/app/main.py`, `backend/app/config.py`
- Create: `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`

- [ ] **Step 1: 给 `pyproject.toml` 加 `web` extra（在现有 `[project.optional-dependencies]` 下追加 `web`）**

```toml
[project.optional-dependencies]
dev = ["pytest>=7.0", "httpx>=0.27"]
web = ["fastapi>=0.110", "uvicorn[standard]>=0.27", "sqlalchemy>=2.0", "itsdangerous>=2.1", "python-multipart>=0.0.9"]
```

- [ ] **Step 2: 建 `backend/app/config.py`**

```python
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # 仓库根
DB_PATH = Path(os.environ.get("SALARY_DB", BASE_DIR / "salary.db"))
DB_URL = f"sqlite:///{DB_PATH}"
TOKEN_SECRET = os.environ.get("SALARY_TOKEN_SECRET", "dev-secret-change-me")
TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 天
DEFAULT_ADMIN = {"username": "admin", "password": "admin"}  # 首启种子账号
```

- [ ] **Step 3: 建 `backend/app/main.py`（先只挂 /health，路由后续任务逐个 include）**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="牛奶提成系统 API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: 建 `backend/__init__.py`、`backend/app/__init__.py`、`backend/tests/__init__.py`（均空）**

- [ ] **Step 5: 建 `backend/tests/conftest.py`（TestClient fixture，后续任务复用）**

```python
import pytest
from fastapi.testclient import TestClient
from backend.app import main as main_module
from backend.app.main import app


@pytest.fixture
def client():
    # 路由与 DB 由后续任务接入；此处仅提供 app client
    with TestClient(app) as c:
        yield c
```

- [ ] **Step 6: 写 `backend/tests/test_health.py`**

```python
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 7: 安装 web extra 并跑测试**

Run: `pip install -e ".[web,dev]" && pytest backend/tests -q`
Expected: `1 passed`

- [ ] **Step 8: 提交**

```bash
git add pyproject.toml backend
git commit -m "feat(backend): FastAPI 骨架与 /health"
```

---

## Task 2: 数据库模型（SQLAlchemy）

**Files:**
- Create: `backend/app/db.py`
- Modify: `backend/app/main.py`（启动建表）
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_db.py`**

```python
from sqlalchemy import create_engine
from backend.app.db import Base, Product, Store, MonthlyTarget, RateVersion, User


def test_create_and_query_product():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    from sqlalchemy.orm import Session
    with Session(eng) as s:
        s.add(Product(barcode="6920001", name="低温奶", spec="200ml", category="低温奶", cost=2))
        s.commit()
        p = s.get(Product, "6920001")
        assert p.category == "低温奶" and p.cost == 2


def test_target_unique_month_store():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    from sqlalchemy.orm import Session
    with Session(eng) as s:
        s.add(MonthlyTarget(month="2026-06", store="福景店", target=84000))
        s.commit()
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_db.py -q`
Expected: FAIL（ModuleNotFoundError）

- [ ] **Step 3: 写实现 `backend/app/db.py`**

```python
"""SQLAlchemy 模型与会话（规格 §4 数据模型）。"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date, DateTime, JSON,
    UniqueConstraint, create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

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
```

- [ ] **Step 4: 在 `main.py` 启动时建表（`backend/app/main.py` 末尾追加）**

```python
from backend.app.db import init_db
init_db()
```

- [ ] **Step 5: 运行验证通过**

Run: `pytest backend/tests/test_db.py -q`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/db.py backend/app/main.py backend/tests/test_db.py
git commit -m "feat(backend): SQLAlchemy 数据模型与建表"
```

---

## Task 3: 账号密码登录与鉴权

**Files:**
- Create: `backend/app/auth.py`, `backend/app/routers/__init__.py`, `backend/app/routers/auth_router.py`
- Modify: `backend/app/main.py`（include auth router + 首启种子管理员）
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_auth.py`**

```python
def test_login_and_protected(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    token = r.json()["token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_protected_requires_token(client):
    assert client.get("/auth/me").status_code == 401


def test_login_wrong_password(client):
    assert client.post("/auth/login", json={"username": "admin", "password": "x"}).status_code == 401
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_auth.py -q`
Expected: FAIL

- [ ] **Step 3: 写 `backend/app/auth.py`**

```python
"""密码哈希(stdlib) + 令牌(itsdangerous) + 鉴权依赖。"""
import hashlib
import hmac
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.app.config import TOKEN_SECRET, TOKEN_MAX_AGE, DEFAULT_ADMIN
from backend.app.db import get_db, User, SessionLocal

_serializer = URLSafeTimedSerializer(TOKEN_SECRET, salt="auth")
_oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    salt = b"salary-static-salt"  # MVP 固定盐；后续可每用户随机盐
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return dk.hex()


def verify_password(password: str, pw_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password), pw_hash)


def make_token(username: str) -> str:
    return _serializer.dumps({"u": username})


def current_user(token: str = Depends(_oauth2), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "未登录")
    try:
        data = _serializer.loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "令牌无效或过期")
    user = db.query(User).filter_by(username=data["u"]).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在")
    return user


def seed_admin():
    """首启若无用户则建默认管理员。"""
    db = SessionLocal()
    try:
        if not db.query(User).first():
            db.add(User(username=DEFAULT_ADMIN["username"],
                        password_hash=hash_password(DEFAULT_ADMIN["password"])))
            db.commit()
    finally:
        db.close()
```

- [ ] **Step 4: 建 `backend/app/routers/__init__.py`（空）和 `backend/app/routers/auth_router.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.auth import make_token, verify_password, current_user
from backend.app.db import get_db, User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    username: str

    class Config:
        from_attributes = True


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(username=body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "账号或密码错误")
    return {"token": make_token(user.username)}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
```

- [ ] **Step 5: `main.py` 挂载路由 + 种子管理员（追加）**

```python
from backend.app.routers import auth_router
from backend.app.auth import seed_admin

app.include_router(auth_router.router)
seed_admin()
```

- [ ] **Step 6: 运行验证通过**

Run: `pytest backend/tests/test_auth.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add backend/app/auth.py backend/app/routers backend/app/main.py backend/tests/test_auth.py
git commit -m "feat(backend): 账号密码登录与令牌鉴权"
```

---

## Task 4: 商品档案 API

**Files:**
- Create: `backend/app/schemas.py`, `backend/app/routers/products.py`
- Modify: `backend/app/main.py`（include products）
- Test: `backend/tests/test_products.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_products.py`（登录后操作）**

```python
def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_product_upsert_and_list(client):
    h = auth_header(client)
    r = client.put("/products/6920001", headers=h, json={
        "barcode": "6920001", "name": "低温奶", "spec": "200ml", "category": "低温奶", "cost": 2})
    assert r.status_code == 200
    r = client.get("/products", headers=h)
    assert r.status_code == 200
    assert any(p["barcode"] == "6920001" for p in r.json())


def test_products_require_auth(client):
    assert client.get("/products").status_code == 401
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_products.py -q`
Expected: FAIL

- [ ] **Step 3: 建 `backend/app/schemas.py`（商品部分）**

```python
from decimal import Decimal
from pydantic import BaseModel


class ProductOut(BaseModel):
    barcode: str
    name: str | None = None
    spec: str | None = None
    category: str | None = None
    cost: Decimal | None = None

    class Config:
        from_attributes = True


class ProductUpsert(BaseModel):
    barcode: str
    name: str | None = None
    spec: str | None = None
    category: str | None = None
    cost: Decimal | None = None
```

- [ ] **Step 4: 建 `backend/app/routers/products.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, Product, User
from backend.app.schemas import ProductOut, ProductUpsert

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.query(Product).order_by(Product.barcode).all()


@router.put("/{barcode}", response_model=ProductOut)
def upsert_product(barcode: str, body: ProductUpsert,
                   _: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.barcode != barcode:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "条码不一致")
    p = db.get(Product, barcode)
    if p is None:
        p = Product(barcode=barcode)
        db.add(p)
    for f in ("name", "spec", "category", "cost"):
        setattr(p, f, getattr(body, f))
    db.commit()
    return p
```

- [ ] **Step 5: `main.py` 挂载（追加一行）**

```python
from backend.app.routers import products as products_router
app.include_router(products_router.router)
```

- [ ] **Step 6: 运行验证通过**

Run: `pytest backend/tests/test_products.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/products.py backend/app/main.py backend/tests/test_products.py
git commit -m "feat(backend): 商品档案 API"
```

---

## Task 5: 门店信息 API（含按组批量改类别）

**Files:**
- Modify: `backend/app/schemas.py`（追加 Store schema）
- Create: `backend/app/routers/stores.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_stores.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_stores.py`**

```python
def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_store_upsert_list_and_batch_class(client):
    h = auth_header(client)
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A", "supervisor": "胡总"})
    client.put("/stores/金星店", headers=h, json={"name": "金星店", "group": "3组", "store_class": "B"})
    r = client.post("/stores/batch-class", headers=h, json={"group": "3组", "store_class": "D"})
    assert r.status_code == 200
    assert r.json()["updated"] == 1   # 金星店(3组)改D
    stores = {s["name"]: s for s in client.get("/stores", headers=h).json()}
    assert stores["福景店"]["store_class"] == "A"
    assert stores["金星店"]["store_class"] == "D"
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_stores.py -q`
Expected: FAIL

- [ ] **Step 3: 追加到 `backend/app/schemas.py`**

```python
class StoreOut(BaseModel):
    name: str
    group: str | None = None
    store_class: str | None = None
    supervisor: str | None = None

    class Config:
        from_attributes = True


class StoreUpsert(BaseModel):
    name: str
    group: str | None = None
    store_class: str | None = None
    supervisor: str | None = None


class BatchClassIn(BaseModel):
    group: str                 # 按组
    store_class: str           # 改成 A/B/C/D
```

- [ ] **Step 4: 建 `backend/app/routers/stores.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, Store, User
from backend.app.schemas import StoreOut, StoreUpsert, BatchClassIn

router = APIRouter(prefix="/stores", tags=["stores"])


@router.get("", response_model=list[StoreOut])
def list_stores(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.query(Store).order_by(Store.name).all()


@router.put("/{name}", response_model=StoreOut)
def upsert_store(name: str, body: StoreUpsert,
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.name != name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "名称不一致")
    s = db.get(Store, name)
    if s is None:
        s = Store(name=name)
        db.add(s)
    for f in ("group", "store_class", "supervisor"):
        setattr(s, f, getattr(body, f))
    db.commit()
    return s


@router.post("/batch-class")
def batch_class(body: BatchClassIn,
                _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Store).filter(Store.group == body.group).all()
    for s in rows:
        s.store_class = body.store_class
    db.commit()
    return {"updated": len(rows)}
```

- [ ] **Step 5: `main.py` 挂载**

```python
from backend.app.routers import stores as stores_router
app.include_router(stores_router.router)
```

- [ ] **Step 6: 运行验证通过**

Run: `pytest backend/tests/test_stores.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/stores.py backend/app/main.py backend/tests/test_stores.py
git commit -m "feat(backend): 门店信息 API + 按组批量改类别"
```

---

## Task 6: 提成比例表版本管理 API

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/rates.py`
- Modify: `backend/app/main.py`（首启种入种子版本）
- Test: `backend/tests/test_rates.py`

> 比例表 `rates` 以 JSON 存：`{cls: {bucket: {tier: "0.13"}}}`（百分数字符串，避免 JSON 数字精度）。引擎查表前由 service 重建为 `RateTable`（2b 实现）。

- [ ] **Step 1: 写失败测试 `backend/tests/test_rates.py`**

```python
def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_seed_and_activate(client):
    h = auth_header(client)
    versions = client.get("/rate-versions", headers=h).json()
    assert len(versions) >= 1
    cur = [v for v in versions if v["is_current"]]
    assert len(cur) == 1   # 种子版本即当前


def test_create_and_activate_new_version(client):
    h = auth_header(client)
    rates = {"A": {"GE_100": {"低温高毛": "0.20"}}}
    r = client.post("/rate-versions", headers=h, json={"effective_from": "2026-07-01", "rates": rates})
    assert r.status_code == 200
    new_id = r.json()["id"]
    assert client.get("/rate-versions", headers=h).json()[-1]["is_current"] is False
    a = client.post(f"/rate-versions/{new_id}/activate", headers=h)
    assert a.status_code == 200
    assert a.json()["is_current"] is True
    # 旧的不再是 current
    assert len([v for v in client.get("/rate-versions", headers=h).json() if v["is_current"]]) == 1
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_rates.py -q`
Expected: FAIL

- [ ] **Step 3: 追加到 `backend/app/schemas.py`**

```python
from datetime import date


class RateVersionOut(BaseModel):
    id: int
    version: int
    effective_from: date
    is_current: bool
    rates: dict

    class Config:
        from_attributes = True


class RateVersionCreate(BaseModel):
    effective_from: date
    rates: dict
```

- [ ] **Step 4: 建 `backend/app/routers/rates.py`**

```python
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, RateVersion, User
from backend.app.schemas import RateVersionOut, RateVersionCreate

router = APIRouter(prefix="/rate-versions", tags=["rates"])


@router.get("", response_model=list[RateVersionOut])
def list_versions(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.query(RateVersion).order_by(RateVersion.version).all()


@router.post("", response_model=RateVersionOut)
def create_version(body: RateVersionCreate,
                   _: User = Depends(current_user), db: Session = Depends(get_db)):
    next_ver = (db.query(RateVersion).count() or 0) + 1
    rv = RateVersion(version=next_ver, effective_from=body.effective_from,
                     is_current=False, rates=body.rates)
    db.add(rv)
    db.commit()
    db.refresh(rv)
    return rv


@router.post("/{vid}/activate", response_model=RateVersionOut)
def activate(vid: int, _: User = Depends(current_user), db: Session = Depends(get_db)):
    rv = db.get(RateVersion, vid)
    if rv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "版本不存在")
    for v in db.query(RateVersion).filter_by(is_current=True).all():
        v.is_current = False
    rv.is_current = True
    db.commit()
    db.refresh(rv)
    return rv
```

- [ ] **Step 5: `main.py` 首启种入种子比例表（追加）**

```python
def seed_rate_table():
    from sqlalchemy.orm import Session
    from backend.app.db import SessionLocal, RateVersion
    from salary_engine.rates import seed_rate_table as _seed
    db = SessionLocal()
    try:
        if not db.query(RateVersion).first():
            rt = _seed()  # 引擎种子
            nested = {}
            for (cls, bucket, tier), pct in rt.rates.items():
                nested.setdefault(cls, {}).setdefault(bucket, {})[tier] = str(pct)
            db.add(RateVersion(version=1, effective_from=rt.effective_from,
                               is_current=True, rates=nested))
            db.commit()
    finally:
        db.close()

seed_rate_table()
```

- [ ] **Step 6: 运行验证通过**

Run: `pytest backend/tests/test_rates.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/rates.py backend/app/main.py backend/tests/test_rates.py
git commit -m "feat(backend): 提成比例表版本管理 API"
```

---

## Task 7: 月度目标 API

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/targets.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_targets.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_targets.py`**

```python
def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_set_and_get_targets(client):
    h = auth_header(client)
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A"})
    r = client.put("/months/2026-06/targets", headers=h, json={
        "items": [{"store": "福景店", "target": "84000"}]})
    assert r.status_code == 200
    got = client.get("/months/2026-06/targets", headers=h).json()
    assert got["2026-06"]["福景店"] == 84000
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_targets.py -q`
Expected: FAIL

- [ ] **Step 3: 追加到 `backend/app/schemas.py`**

```python
from decimal import Decimal


class TargetItem(BaseModel):
    store: str
    target: Decimal


class TargetBatch(BaseModel):
    items: list[TargetItem]
```

- [ ] **Step 4: 建 `backend/app/routers/targets.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, MonthlyTarget, User
from backend.app.schemas import TargetBatch

router = APIRouter(tags=["targets"])


@router.get("/months/{month}/targets")
def get_targets(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(MonthlyTarget).filter_by(month=month).all()
    return {month: {r.store: float(r.target) for r in rows}}


@router.put("/months/{month}/targets")
def set_targets(month: str, body: TargetBatch,
                _: User = Depends(current_user), db: Session = Depends(get_db)):
    for it in body.items:
        row = db.query(MonthlyTarget).filter_by(month=month, store=it.store).first()
        if row is None:
            row = MonthlyTarget(month=month, store=it.store, target=it.target)
            db.add(row)
        else:
            row.target = it.target
    db.commit()
    return {"saved": len(body.items)}
```

- [ ] **Step 5: `main.py` 挂载**

```python
from backend.app.routers import targets as targets_router
app.include_router(targets_router.router)
```

- [ ] **Step 6: 运行验证通过**

Run: `pytest backend/tests/test_targets.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/targets.py backend/app/main.py backend/tests/test_targets.py
git commit -m "feat(backend): 月度目标 API"
```

---

## Task 8: 主数据 Excel 导入

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/import_master.py`
- Create: `backend/app/routers/import_master.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_import_master.py`

> 复用 `salary_engine.importer` 解析，结果 upsert 进 DB。上传文件先落临时文件再交给 importer。

- [ ] **Step 1: 写失败测试 `backend/tests/test_import_master.py`（用合成 xlsx）**

```python
import openpyxl


def _ws(path, header, rows):
    wb = openpyxl.Workbook(); ws = wb.active; ws.append(header)
    for r in rows: ws.append(r)
    wb.save(path)


def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_import_products(tmp_path, client):
    h = auth_header(client)
    info = tmp_path / "info.xlsx"
    _ws(info, ["国际条码", "商品名称", "规格", "类别"], [["6920001", "低温奶", "200ml", "低温奶"]])
    cost = tmp_path / "cost.xlsx"
    _ws(cost, ["商品条码", "商品名称", "销售成本"], [["6920001", "低温奶（件）", "20"]])
    r = client.post("/import/products", headers=h,
                    files={"info": ("info.xlsx", open(info, "rb")),
                           "cost": ("cost.xlsx", open(cost, "rb"))})
    assert r.status_code == 200
    assert r.json()["products"] >= 1
    p = client.get("/products", headers=h).json()
    assert any(x["barcode"] == "6920001" and x["cost"] == 20 for x in p)


def test_import_stores(tmp_path, client):
    h = auth_header(client)
    stores = tmp_path / "stores.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "cfg"
    ws.append(["主管", "类别", "组别", "名称", "本月目标"])
    ws.append(["胡总", "A", "1组", "福景店", 84000])
    wb.save(stores)
    r = client.post("/import/stores", headers=h,
                    data={"sheet": "cfg"}, files={"file": ("stores.xlsx", open(stores, "rb"))})
    assert r.status_code == 200
    assert r.json()["stores"] >= 1
    s = {x["name"]: x for x in client.get("/stores", headers=h).json()}
    assert s["福景店"]["store_class"] == "A"
    tg = client.get("/months/2026-06/targets", headers=h).json()  # 缺月份→空，目标需单独配月
```

> 注：导入门店只建门店档案；月度目标需在"月度目标"里按月配置（导入不绑定月份）。上面的目标断言因此只校验门店。

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_import_master.py -q`
Expected: FAIL

- [ ] **Step 3: 建 `backend/app/services/__init__.py`（空）和 `backend/app/services/import_master.py`**

```python
"""主数据导入服务：复用 salary_engine.importer 解析后 upsert 进 DB。"""
from sqlalchemy.orm import Session
from backend.app.db import Product, Store


def upsert_products(db: Session, products: dict) -> int:
    """products: {barcode: salary_engine.models.Product}"""
    n = 0
    for bc, p in products.items():
        row = db.get(Product, bc)
        if row is None:
            row = Product(barcode=bc)
            db.add(row)
        row.name, row.spec, row.category, row.cost = p.name, p.spec, p.category, p.cost
        n += 1
    db.commit()
    return n


def upsert_stores(db: Session, stores: dict, targets: dict, month: str | None = None) -> int:
    """stores: {name: Store}; targets: {name: Decimal}。targets 仅在 month 给出时写入。"""
    from backend.app.db import MonthlyTarget
    n = 0
    for name, s in stores.items():
        row = db.get(Store, name)
        if row is None:
            row = Store(name=name)
            db.add(row)
        row.group, row.store_class, row.supervisor = s.group, s.store_class, s.supervisor
        n += 1
    if month:
        for name, tgt in targets.items():
            row = db.query(MonthlyTarget).filter_by(month=month, store=name).first()
            if row is None:
                row = MonthlyTarget(month=month, store=name, target=tgt)
                db.add(row)
            else:
                row.target = tgt
    db.commit()
    return n
```

- [ ] **Step 4: 建 `backend/app/routers/import_master.py`**

```python
import tempfile, os
from fastapi import APIRouter, Depends, Form, UploadFile, File
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, User
from backend.app.services.import_master import upsert_products, upsert_stores
from salary_engine.importer import load_products_xlsx, load_stores_xlsx

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/products")
def import_products(info: UploadFile = File(...), cost: UploadFile = File(None),
                    _: User = Depends(current_user), db: Session = Depends(get_db)):
    info_path = _save(info)
    cost_path = _save(cost) if cost else None
    products = load_products_xlsx(info_path, cost_path)
    n = upsert_products(db, products)
    _clean(info_path, cost_path)
    return {"products": n}


@router.post("/stores")
def import_stores(file: UploadFile = File(...), sheet: str = Form(None),
                  month: str = Form(None),
                  _: User = Depends(current_user), db: Session = Depends(get_db)):
    path = _save(file)
    stores, targets = load_stores_xlsx(path, sheet)
    n = upsert_stores(db, stores, targets, month=month)
    _clean(path)
    return {"stores": n}


def _save(f: UploadFile) -> str:
    suffix = os.path.splitext(f.filename or "u.xlsx")[1] or ".xlsx"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as out:
        out.write(f.file.read())
    return path


def _clean(*paths):
    for p in paths:
        if p:
            try: os.remove(p)
            except OSError: pass
```

- [ ] **Step 5: `main.py` 挂载**

```python
from backend.app.routers import import_master as import_router
app.include_router(import_router.router)
```

- [ ] **Step 6: 运行全部测试**

Run: `pytest -q`
Expected: 全部 PASS

- [ ] **Step 7: 提交**

```bash
git add backend/app/services backend/app/routers/import_master.py backend/app/main.py backend/tests/test_import_master.py
git commit -m "feat(backend): 主数据 Excel 导入"
```

---

## Self-Review（计划自审，已核对）

**1. 规格覆盖（2a 范围内）：** §4 主数据(商品/门店/比例表版本/月度目标) → Task2-7 ✓；§5 账号密码登录 → Task3 ✓；§3 门店"按组批量改类别" → Task5 ✓；§4 比例表版本化 → Task6 ✓；§7 新建月份复制上月目标 → 留 2b（月度流程）。**销售/让利/当班/计算/结果 API 属 2b，不在本计划。**
**2. 占位扫描：** 无 TODO/TBD；每个任务有完整测试与实现代码。
**3. 类型一致：** `Product.cost` 用 Numeric，pydantic `Decimal`，序列化目标用 `float`（MVP，金额在 2b 计算时仍用引擎 Decimal）。`rates` JSON 用百分数字符串，2b 重建 `RateTable` 时还原。
**4. 复用引擎：** Task6 种子用 `salary_engine.rates.seed_rate_table`；Task8 导入用 `salary_engine.importer.load_*_xlsx` —— 不重写解析逻辑。

---

## 执行交接

Plan 2a 完成后，得到一个**可运行、有测试、带登录与主数据管理**的后端（`uvicorn backend.app.main:app`）。之后：
- **Plan 2b · 月度流程 API**：销售/让利导入、当班推断+确认网格、计算（复用引擎）、结果查询与导出。
- **Plan 3 · Web 前端**：React 四屏，消费 2a+2b 的 API。

**执行方式：** 建议沿用 Plan 1 的**子代理驱动**（每任务一个新子代理 + 审查）。
