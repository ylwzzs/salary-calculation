from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, RateVersion, User
from backend.app.schemas import RateVersionOut, RateVersionCreate

router = APIRouter(prefix="/rate-versions", tags=["rates"])


@router.get("", response_model=list[RateVersionOut])
def list_versions(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.query(RateVersion).order_by(RateVersion.version).all()


@router.post("", response_model=RateVersionOut)
def create_version(body: RateVersionCreate,
                   _: User = Depends(current_user), db: Session = Depends(get_db)):
    next_ver = (db.query(RateVersion).count() or 0) + 1
    rv = RateVersion(version=next_ver, effective_from=body.effective_from,
                     is_current=False, rates=body.rates)
    db.add(rv)
    db.commit()
    db.refresh(rv)
    return rv


@router.post("/{vid}/activate", response_model=RateVersionOut)
def activate(vid: int, _: User = Depends(current_user), db: Session = Depends(get_db)):
    rv = db.get(RateVersion, vid)
    if rv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "版本不存在")
    for v in db.query(RateVersion).filter_by(is_current=True).all():
        v.is_current = False
    rv.is_current = True
    db.commit()
    db.refresh(rv)
    return rv
