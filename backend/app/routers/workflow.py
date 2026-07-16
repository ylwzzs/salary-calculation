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
