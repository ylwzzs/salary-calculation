import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.config import BASE_DIR
from backend.app.db import get_db, Month, User

router = APIRouter(tags=["workflow"])
UPLOAD_DIR = BASE_DIR / "uploads"


def _save_upload(month: str, f: UploadFile, kind: str) -> str:
    suffix = os.path.splitext(f.filename or "u.xlsx")[1] or ".xlsx"
    d = UPLOAD_DIR / month
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{kind}{suffix}"
    with open(path, "wb") as out:
        out.write(f.file.read())
    return str(path)


def _get_month(db, month) -> Month:
    m = db.get(Month, month)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")
    return m


@router.post("/months/{month}/import-sales")
def import_sales(month: str, file: UploadFile = File(...),
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    m.sales_file = _save_upload(month, file, "sales")
    db.commit()
    return {"sales_file": m.sales_file}


@router.post("/months/{month}/import-gifts")
def import_gifts(month: str, file: UploadFile = File(...),
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    m.gifts_file = _save_upload(month, file, "gifts")
    db.commit()
    return {"gifts_file": m.gifts_file}


from datetime import date as date_type
from dataclasses import replace
from pydantic import BaseModel
from salary_engine.importer import load_sales_xlsx
from salary_engine.calculator import clean_store
from salary_engine.onduty import infer_duty
from backend.app.db import Duty


class DutyItem(BaseModel):
    store: str
    date: str          # YYYY-MM-DD
    salesperson: str


class DutyBatch(BaseModel):
    items: list[DutyItem]


def _load_sales_lines(path: str):
    raw = load_sales_xlsx(path)
    from salary_engine.models import SalesLine  # noqa: 保留显式引用
    return [replace(s, store=clean_store(s.store)) for s in raw]


@router.post("/months/{month}/infer-duty")
def infer(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    if not m.sales_file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")
    duty = infer_duty([s for s in _load_sales_lines(m.sales_file) if not s.is_return])
    grid = {}
    for (store, d), p in duty.items():
        ds = d.isoformat() if hasattr(d, "isoformat") else str(d)
        grid.setdefault(store, {})[ds] = p if isinstance(p, str) else list(p)
    return grid


@router.put("/months/{month}/duty")
def set_duty(month: str, body: DutyBatch,
             _: User = Depends(current_user), db: Session = Depends(get_db)):
    _get_month(db, month)
    db.query(Duty).filter_by(month=month).delete()
    for it in body.items:
        db.add(Duty(month=month, store=it.store,
                    duty_date=date_type.fromisoformat(it.date), salesperson=it.salesperson))
    db.commit()
    return {"saved": len(body.items)}


@router.get("/months/{month}/duty")
def get_duty(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Duty).filter_by(month=month).all()
    grid = {}
    for r in rows:
        grid.setdefault(r.store, {})[r.duty_date.isoformat()] = r.salesperson
    return grid


from decimal import Decimal
from collections import defaultdict
from salary_engine.importer import load_gift_keys_xlsx
from salary_engine.calculator import compute
from backend.app.services.engine_bridge import (
    rates_from_db, products_from_db, stores_from_db, targets_from_db,
    duty_override_from_db, days_in_month,
)
from backend.app.db import Result, RateVersion


def _run_compute(db, month: str):
    """组装引擎入参并执行计算（Task 6 export 复用）。"""
    m = _get_month(db, month)
    if not m.sales_file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")
    sales = _load_sales_lines(m.sales_file)
    gifts = load_gift_keys_xlsx(m.gifts_file) if m.gifts_file else set()
    result = compute(
        sales_lines=sales,
        products=products_from_db(db),
        stores=stores_from_db(db),
        targets=targets_from_db(db, month),
        rate_table=rates_from_db(db),
        month=month, days=days_in_month(month),
        gift_keys=gifts,
        duty_override=duty_override_from_db(db, month),
    )
    return result


@router.post("/months/{month}/compute")
def do_compute(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    result = _run_compute(db, month)
    db.query(Result).filter_by(month=month).delete()
    for (person, store), v in result.breakdown.items():
        db.add(Result(month=month, person=person, store=store,
                      sales=v["sales"], target=v["target"], achievement=v["achievement"],
                      bucket=v["bucket"], commission=v["commission"]))
    m = db.get(Month, month)
    m.status = "computed"
    cur = db.query(RateVersion).filter_by(is_current=True).first()
    if cur:
        m.rate_version_id = cur.id
    db.commit()
    return {"details": len(result.details), "warnings": result.warnings,
            "total": float(sum(result.commission_by_person.values()))}


@router.get("/months/{month}/results")
def results(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """初版：从 Result 表汇总。Task 6 会扩展（breakdown 排序等）。"""
    rows = db.query(Result).filter_by(month=month).all()
    salary = defaultdict(Decimal)
    breakdown = []
    for r in rows:
        salary[r.person] += r.commission
        breakdown.append({"person": r.person, "store": r.store,
                          "sales": float(r.sales), "target": float(r.target),
                          "achievement": float(r.achievement), "bucket": r.bucket,
                          "commission": float(r.commission)})
    salary = sorted(({"person": p, "commission": float(c)} for p, c in salary.items()),
                    key=lambda x: x["commission"], reverse=True)
    return {"salary": salary, "breakdown": breakdown}
