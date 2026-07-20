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


def seed_salary_policy():
    """首启若无 SalaryPolicyVersion，种 v1（单一真值源，ADR-006/009）。
    内容来自引擎种子 seed_rate_table：commission_rates 存百分数（÷100 在 engine_bridge 边界）。"""
    from backend.app.db import SessionLocal, SalaryPolicyVersion
    from salary_engine.rates import seed_rate_table as _seed
    db = SessionLocal()
    try:
        if not db.query(SalaryPolicyVersion).first():
            rt = _seed()
            cr = {}
            for (cls, bucket, tier), frac in rt.rates.items():
                cr.setdefault(cls, {}).setdefault(bucket, {})[tier] = str(int(frac * 100))
            db.add(SalaryPolicyVersion(
                version=1, effective_from=rt.effective_from, is_current=True,
                content={"margin_rules": {}, "commission_rates": cr},
                note="首启种子（来自引擎 seed_rate_table）", created_by="system"))
            db.commit()
    finally:
        db.close()


seed_salary_policy()

from backend.app.routers import products as products_router
app.include_router(products_router.router)

from backend.app.routers import stores as stores_router
app.include_router(stores_router.router)

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
