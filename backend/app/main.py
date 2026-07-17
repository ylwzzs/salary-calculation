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


from backend.app.db import init_db
init_db()

from backend.app.routers import auth_router
from backend.app.auth import seed_admin

app.include_router(auth_router.router)
seed_admin()


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

from backend.app.routers import products as products_router
app.include_router(products_router.router)

from backend.app.routers import stores as stores_router
app.include_router(stores_router.router)

from backend.app.routers import rates as rates_router
app.include_router(rates_router.router)

from backend.app.routers import targets as targets_router
app.include_router(targets_router.router)

from backend.app.routers import import_master as import_router
app.include_router(import_router.router)

from backend.app.routers import months as months_router
app.include_router(months_router.router)

from backend.app.routers import workflow as workflow_router
app.include_router(workflow_router.router)

from backend.app.routers import salary_policies as salary_policies_router
app.include_router(salary_policies_router.router)

from backend.app.routers import anomalies as anomalies_router
app.include_router(anomalies_router.router)
