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
    body: dict,
    _: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    """更新当前步骤"""
    m = db.get(Month, month)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")

    step = body.get("step")
    step_data = body.get("step_data")

    if step:
        m.current_step = step
    if step_data:
        # 合并step_data，需要重新赋值以触发SQLAlchemy更新
        current = dict(m.step_data or {})
        current.update(step_data)
        m.step_data = current

    db.commit()
    return {"month": month, "current_step": m.current_step, "step_data": m.step_data}


@router.post("/{month}/reset")
def reset_month(
    month: str,
    _: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    """重置月份计算（重新计算）。

    清除 Compute 物化的 Result / DetailRow / Anomaly，并解锁 policy_version_id，
    否则读端点（tier_summary/tier_detail/export）会读到 PHANTOM 残留数据，
    且后续 /compute 会复用 pre-reset 锁定的策略（H10 守卫恒为 False）。
    """
    m = db.get(Month, month)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")

    from backend.app.db import Result, Anomaly, DetailRow
    db.query(Result).filter_by(month=month).delete()
    db.query(DetailRow).filter_by(month=month).delete()
    db.query(Anomaly).filter_by(month=month).delete()

    m.status = "draft"
    m.current_step = "import"
    m.step_data = {}
    m.policy_version_id = None  # 解锁策略，让下次 /compute 重新锁定
    m.results_stale = True

    db.commit()
    return {"reset": month}
