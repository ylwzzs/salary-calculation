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
