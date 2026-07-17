from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, Anomaly, User
from backend.app.schemas import AnomalyOut, AnomalyResolve

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


@router.get("/month/{month}", response_model=List[AnomalyOut])
def list_anomalies(
    month: str,
    anomaly_status: Optional[str] = None,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """获取月份的异常列表"""
    query = db.query(Anomaly).filter(Anomaly.month == month)
    if anomaly_status:
        query = query.filter(Anomaly.status == anomaly_status)
    return query.order_by(Anomaly.anomaly_type, Anomaly.id).all()


@router.post("/{anomaly_id}/resolve", response_model=AnomalyOut)
def resolve_anomaly(
    anomaly_id: int,
    body: AnomalyResolve,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """处理异常"""
    anomaly = db.get(Anomaly, anomaly_id)
    if not anomaly:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "异常不存在")

    anomaly.status = "resolved"
    anomaly.resolution = body.resolution
    anomaly.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(anomaly)
    return anomaly


@router.post("/{anomaly_id}/ignore", response_model=AnomalyOut)
def ignore_anomaly(
    anomaly_id: int,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """忽略异常"""
    anomaly = db.get(Anomaly, anomaly_id)
    if not anomaly:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "异常不存在")

    anomaly.status = "ignored"
    db.commit()
    db.refresh(anomaly)
    return anomaly


@router.delete("/{anomaly_id}")
def delete_anomaly(
    anomaly_id: int,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """删除异常（用于重新计算时清理）"""
    anomaly = db.get(Anomaly, anomaly_id)
    if anomaly:
        db.delete(anomaly)
        db.commit()
    return {"deleted": anomaly_id}


@router.delete("/month/{month}")
def clear_month_anomalies(
    month: str,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """清除月份所有异常"""
    deleted = db.query(Anomaly).filter(Anomaly.month == month).delete()
    db.commit()
    return {"deleted": deleted}
