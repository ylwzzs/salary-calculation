from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from decimal import Decimal

from backend.app.auth import current_user
from backend.app.db import get_db, MonthlyTarget, Store, User, Month
from backend.app.schemas import TargetBatch

router = APIRouter(tags=["targets"])


class TargetOut(BaseModel):
    id: int
    month: str
    store: str
    target: float

    class Config:
        from_attributes = True


class TargetCreate(BaseModel):
    month: str
    store: str
    target: Decimal


# 全局月度目标管理
@router.get("/targets", response_model=list[TargetOut])
def list_targets(month: str = None, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """获取目标列表，可按月份过滤"""
    query = db.query(MonthlyTarget)
    if month:
        query = query.filter_by(month=month)
    return query.order_by(MonthlyTarget.month, MonthlyTarget.store).all()


@router.post("/targets", response_model=TargetOut, status_code=status.HTTP_201_CREATED)
def create_target(body: TargetCreate, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """创建单条目标"""
    # 检查门店是否存在
    store = db.get(Store, body.store)
    if not store:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "门店不存在")

    # 检查是否已存在
    existing = db.query(MonthlyTarget).filter_by(month=body.month, store=body.store).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "该门店当月目标已存在")

    target = MonthlyTarget(month=body.month, store=body.store, target=body.target)
    db.add(target)
    # 输入变更：已计算月份的物化结果不再可信，置 stale 让前端提示重算（T5.1）
    m = db.get(Month, body.month)
    if m is not None:
        m.results_stale = True
    db.commit()
    db.refresh(target)
    return target


@router.post("/targets/batch", status_code=status.HTTP_201_CREATED)
def batch_create_targets(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """批量创建目标，自动代入参与考核的门店"""
    # 获取所有参与考核的门店
    stores = db.query(Store).filter(Store.exclude_assessment == False).all()

    if not stores:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "没有参与考核的门店")

    # 检查月份是否已有目标
    existing_count = db.query(MonthlyTarget).filter_by(month=month).count()
    if existing_count > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"该月份已有 {existing_count} 条目标，请先清空")

    # 批量创建
    created = []
    for store in stores:
        target = MonthlyTarget(month=month, store=store.name, target=0)
        db.add(target)
        created.append(store.name)

    # 输入变更：标记该月结果为 stale（T5.1）
    m = db.get(Month, month)
    if m is not None:
        m.results_stale = True

    db.commit()
    return {"created": len(created), "stores": created}


@router.put("/targets/{target_id}", response_model=TargetOut)
def update_target(target_id: int, target_value: Decimal,
                  _: User = Depends(current_user), db: Session = Depends(get_db)):
    """更新目标金额"""
    target = db.get(MonthlyTarget, target_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "目标不存在")

    target.target = target_value
    # 输入变更：标记该目标所属月份结果为 stale（T5.1）
    m = db.get(Month, target.month)
    if m is not None:
        m.results_stale = True
    db.commit()
    db.refresh(target)
    return target


@router.delete("/targets/{target_id}")
def delete_target(target_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """删除单条目标"""
    target = db.get(MonthlyTarget, target_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "目标不存在")

    month = target.month
    db.delete(target)
    # 输入变更：标记该目标所属月份结果为 stale（T5.1）
    m = db.get(Month, month)
    if m is not None:
        m.results_stale = True
    db.commit()
    return {"deleted": target_id}


@router.delete("/targets/month/{month}")
def delete_month_targets(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """删除整月目标"""
    count = db.query(MonthlyTarget).filter_by(month=month).delete()
    # 输入变更：标记该月结果为 stale（T5.1）
    m = db.get(Month, month)
    if m is not None:
        m.results_stale = True
    db.commit()
    return {"deleted": count}


# 保留原有API兼容性
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
    m = db.get(Month, month)
    if m is not None:
        m.results_stale = True
    db.commit()
    return {"saved": len(body.items)}
