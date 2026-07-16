from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, MonthlyTarget, User
from backend.app.schemas import TargetBatch

router = APIRouter(tags=["targets"])


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
    db.commit()
    return {"saved": len(body.items)}
