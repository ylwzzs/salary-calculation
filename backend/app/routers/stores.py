from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, Store, User, mark_all_months_stale
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
    for f in ("group", "store_class", "supervisor", "exclude_assessment"):
        setattr(s, f, getattr(body, f))
    mark_all_months_stale(db)
    db.commit()
    return s


class StorePatch(BaseModel):
    group: Optional[Any] = None
    store_class: Optional[Any] = None
    supervisor: Optional[Any] = None
    exclude_assessment: Optional[bool] = None


@router.patch("/{name}", response_model=StoreOut)
def patch_store(name: str, body: StorePatch,
                _: User = Depends(current_user), db: Session = Depends(get_db)):
    """部分更新门店字段，只更新传入的字段"""
    s = db.get(Store, name)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "门店不存在")
    # 获取请求体中的字段（区分未传入和传入null）
    update_data = body.dict(exclude_unset=True)
    for f, val in update_data.items():
        if f in ("group", "store_class", "supervisor", "exclude_assessment"):
            setattr(s, f, val)
    mark_all_months_stale(db)
    db.commit()
    return s


@router.delete("/{name}")
def delete_store(name: str,
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(Store, name)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "门店不存在")
    db.delete(s)
    mark_all_months_stale(db)
    db.commit()
    return {"deleted": name}


@router.post("/batch-class")
def batch_class(body: BatchClassIn,
                _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Store).filter(Store.group == body.group).all()
    for s in rows:
        s.store_class = body.store_class
    mark_all_months_stale(db)
    db.commit()
    return {"updated": len(rows)}
