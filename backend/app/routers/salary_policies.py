from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
import openpyxl
from openpyxl.styles import Font, Border, Side, Alignment, PatternFill

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
    next_version = (db.query(func.max(SalaryPolicyVersion.version)).scalar() or 0) + 1

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


@router.get("/{policy_id}/export/excel")
def export_excel(
    policy_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)
):
    """导出薪酬制度为 Excel 文件"""
    policy = db.get(SalaryPolicyVersion, policy_id)
    if policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "薪酬制度版本不存在")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"薪酬制度v{policy.version}"

    # 样式定义
    header_font = Font(bold=True, size=12)
    header_fill = PatternFill(start_color="E0E0E0", end_color="E0E0E0", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )
    center_align = Alignment(horizontal="center", vertical="center")

    # 标题行
    ws["A1"] = f"薪酬制度 v{policy.version}"
    ws["A1"].font = Font(bold=True, size=14)
    ws.merge_cells("A1:F1")

    ws["A2"] = f"生效日期: {policy.effective_from}"
    ws["A3"] = f"备注: {policy.note or '无'}"

    # 毛利率规则表
    ws["A5"] = "一、毛利率分类规则"
    ws["A5"].font = header_font

    row = 6
    ws.cell(row=row, column=1, value="商品分类").font = header_font
    ws.cell(row=row, column=2, value="正价(高毛利)").font = header_font
    ws.cell(row=row, column=3, value="低价(低毛利)").font = header_font
    ws.cell(row=row, column=4, value="特价").font = header_font
    for col in range(1, 5):
        ws.cell(row=row, column=col).fill = header_fill
        ws.cell(row=row, column=col).border = thin_border

    row += 1
    margin_rules = policy.content.get("margin_rules", {})
    for cat, rules in margin_rules.items():
        high_min = rules.get("high", {}).get("min", "")
        low_min = rules.get("low", {}).get("min", "")
        low_max = rules.get("low", {}).get("max", "")
        special_max = rules.get("special", {}).get("max", "")

        ws.cell(row=row, column=1, value=cat).border = thin_border
        ws.cell(row=row, column=2, value=f">{high_min}%" if high_min else "-").border = thin_border
        ws.cell(row=row, column=3, value=f"{low_min}-{low_max}%" if low_min and low_max else "-").border = thin_border
        ws.cell(row=row, column=4, value=f"≤{special_max}%" if special_max else "-").border = thin_border
        row += 1

    # 提成比例表
    row += 2
    ws.cell(row=row, column=1, value="二、提成比例表(%)").font = header_font
    row += 1

    # 表头: 达成档位 | 商品档位 | A类 | B类 | C类 | D类
    ws.cell(row=row, column=1, value="达成档位").font = header_font
    ws.cell(row=row, column=2, value="商品档位").font = header_font
    ws.cell(row=row, column=3, value="A类").font = header_font
    ws.cell(row=row, column=4, value="B类").font = header_font
    ws.cell(row=row, column=5, value="C类").font = header_font
    ws.cell(row=row, column=6, value="D类").font = header_font
    for col in range(1, 7):
        ws.cell(row=row, column=col).fill = header_fill
        ws.cell(row=row, column=col).border = thin_border

    commission_rates = policy.content.get("commission_rates", {})
    buckets = ["GE_100", "90_100", "80_90", "70_80", "LT_70"]
    bucket_labels = [">=100%", "90-100%", "80-90%", "70-80%", "<70%"]
    tiers = ["低温低毛", "低温高毛", "常温低毛", "常温高毛", "特价"]

    row += 1
    for bi, bucket in enumerate(buckets):
        for ti, tier in enumerate(tiers):
            ws.cell(row=row, column=1, value=bucket_labels[bi] if ti == 0 else "").border = thin_border
            if ti == 0:
                ws.cell(row=row, column=1).alignment = Alignment(vertical="center")

            ws.cell(row=row, column=2, value=tier).border = thin_border

            for ci, cls in enumerate(["A", "B", "C", "D"]):
                val = commission_rates.get(cls, {}).get(bucket, {}).get(tier, "-")
                ws.cell(row=row, column=3 + ci, value=val).border = thin_border
                ws.cell(row=row, column=3 + ci).alignment = center_align

            row += 1

    # 调整列宽
    ws.column_dimensions["A"].width = 14
    ws.column_dimensions["B"].width = 14
    for col in ["C", "D", "E", "F"]:
        ws.column_dimensions[col].width = 10

    # 输出
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    from urllib.parse import quote
    filename = f"salary_policy_v{policy.version}_{policy.effective_from}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={quote(filename)}"},
    )

