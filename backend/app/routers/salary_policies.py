from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, SalaryPolicyVersion, Month, User
from backend.app.schemas import (
    SalaryPolicyOut,
    SalaryPolicyCreate,
    SalaryPolicySummary,
)

router = APIRouter(prefix="/salary-policies", tags=["salary-policies"])


def _month_usage(db: Session, policy_id: int) -> list[str]:
    return [
        row[0]
        for row in db.query(Month.month)
        .filter(Month.policy_version_id == policy_id)
        .order_by(Month.month)
        .all()
    ]


@router.get("", response_model=list[SalaryPolicySummary])
def list_policies(_: User = Depends(current_user), db: Session = Depends(get_db)):
    versions = (
        db.query(SalaryPolicyVersion)
        .order_by(SalaryPolicyVersion.version.desc())
        .all()
    )
    result = []
    for v in versions:
        summary = SalaryPolicySummary.model_validate(v)
        summary.used_by_months = _month_usage(db, v.id)
        result.append(summary)
    return result


@router.get("/current", response_model=SalaryPolicyOut)
def get_current(_: User = Depends(current_user), db: Session = Depends(get_db)):
    policy = db.query(SalaryPolicyVersion).filter_by(is_current=True).first()
    if policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "当前没有激活的薪酬制度版本")
    return policy


@router.get("/{policy_id}", response_model=SalaryPolicyOut)
def get_policy(policy_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)):
    policy = db.get(SalaryPolicyVersion, policy_id)
    if policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "薪酬制度版本不存在")
    return policy


@router.post("", response_model=SalaryPolicyOut, status_code=status.HTTP_201_CREATED)
def create_policy(
    body: SalaryPolicyCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    next_version = (db.query(SalaryPolicyVersion).count() or 0) + 1

    for v in db.query(SalaryPolicyVersion).filter_by(is_current=True).all():
        v.is_current = False

    policy = SalaryPolicyVersion(
        version=next_version,
        effective_from=body.effective_from,
        is_current=True,
        created_by=user.username,
        content=body.content.model_dump(),
        note=body.note,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.post("/{policy_id}/activate", response_model=SalaryPolicyOut)
def activate_policy(
    policy_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)
):
    policy = db.get(SalaryPolicyVersion, policy_id)
    if policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "薪酬制度版本不存在")

    for v in db.query(SalaryPolicyVersion).filter_by(is_current=True).all():
        v.is_current = False

    policy.is_current = True
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/{policy_id}")
def delete_policy(
    policy_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)
):
    policy = db.get(SalaryPolicyVersion, policy_id)
    if policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "薪酬制度版本不存在")

    if policy.is_current:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "不能删除当前激活的薪酬制度版本"
        )

    used_months = _month_usage(db, policy_id)
    if used_months:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"不能删除已被月份使用的薪酬制度版本: {', '.join(used_months)}",
        )

    total = db.query(SalaryPolicyVersion).count()
    if total <= 1:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "不能删除唯一剩余的薪酬制度版本"
        )

    db.delete(policy)
    db.commit()
    return {"ok": True}
