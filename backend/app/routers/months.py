from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, Month, MonthlyTarget, User
from backend.app.schemas import MonthOut, MonthCreate

router = APIRouter(prefix="/months", tags=["months"])


@router.post("", response_model=MonthOut)
def create_month(body: MonthCreate,
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    if db.get(Month, body.month):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "月份已存在")
    m = Month(month=body.month)
    db.add(m)
    if body.copy_from:
        src = db.query(MonthlyTarget).filter_by(month=body.copy_from).all()
        for t in src:
            db.add(MonthlyTarget(month=body.month, store=t.store, target=t.target))
    db.commit()
    db.refresh(m)
    return m


@router.get("", response_model=list[MonthOut])
def list_months(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.query(Month).order_by(Month.month.desc()).all()


@router.get("/{month}", response_model=MonthOut)
def get_month(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(Month, month)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")
    return m


@router.put("/{month}/step")
def update_step(
    month: str,
    step: str,
    step_data: dict | None = None,
    _: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    """更新当前步骤"""
    m = db.get(Month, month)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")
    
    m.current_step = step
    if step_data:
        if not m.step_data:
            m.step_data = {}
        m.step_data.update(step_data)
    
    db.commit()
    return {"month": month, "current_step": step, "step_data": m.step_data}


@router.post("/{month}/reset")
def reset_month(
    month: str,
    _: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    """重置月份计算（重新计算）"""
    m = db.get(Month, month)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")
    
    from backend.app.db import Result, Anomaly
    db.query(Result).filter_by(month=month).delete()
    db.query(Anomaly).filter_by(month=month).delete()
    
    m.status = "draft"
    m.current_step = "import"
    m.step_data = {}
    m.rate_version_id = None
    
    db.commit()
    return {"reset": month}
