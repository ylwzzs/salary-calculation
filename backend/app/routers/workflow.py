import os
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.config import BASE_DIR
from backend.app.db import get_db, Month, User

router = APIRouter(tags=["workflow"])
UPLOAD_DIR = BASE_DIR / "uploads"


def _save_upload(month: str, f: UploadFile, kind: str) -> str:
    suffix = os.path.splitext(f.filename or "u.xlsx")[1] or ".xlsx"
    d = UPLOAD_DIR / month
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{kind}{suffix}"
    with open(path, "wb") as out:
        out.write(f.file.read())
    return str(path)


def _get_month(db, month) -> Month:
    m = db.get(Month, month)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")
    return m


@router.post("/months/{month}/import-sales")
def import_sales(month: str, file: UploadFile = File(...),
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    m.sales_file = _save_upload(month, file, "sales")
    m.results_stale = True
    db.commit()

    # 同时导入到数据库并打标签
    from backend.app.services.sales_importer import import_sales_to_db
    from salary_engine.importer import load_sales_xlsx, load_gift_keys_xlsx

    # 清除缓存
    _clear_sales_cache(m.sales_file)

    sales = load_sales_xlsx(m.sales_file)
    gift_keys = set()
    if m.gifts_file:
        try:
            gift_keys = load_gift_keys_xlsx(m.gifts_file)
        except Exception as e:
            print(f"Warning: Failed to load gift keys: {e}")

    result = import_sales_to_db(db, month, sales, gift_keys)
    return {"sales_file": m.sales_file, **result}


@router.post("/months/{month}/import-gifts")
def import_gifts(month: str, file: UploadFile = File(...),
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    m.gifts_file = _save_upload(month, file, "gifts")
    m.results_stale = True
    db.commit()

    # 如果已有销售数据，重新打标签
    if m.sales_file:
        from backend.app.services.sales_importer import import_sales_to_db
        from salary_engine.importer import load_sales_xlsx, load_gift_keys_xlsx

        _clear_sales_cache(m.sales_file)
        sales = load_sales_xlsx(m.sales_file)
        gift_keys = set()
        try:
            gift_keys = load_gift_keys_xlsx(m.gifts_file)
        except Exception as e:
            print(f"Warning: Failed to load gift keys: {e}")

        import_sales_to_db(db, month, sales, gift_keys)

    return {"gifts_file": m.gifts_file}


from datetime import date as date_type
from dataclasses import replace
from pydantic import BaseModel
from salary_engine.importer import load_sales_xlsx
from salary_engine.calculator import clean_store
from salary_engine.onduty import infer_duty
from backend.app.db import Duty


class DutyItem(BaseModel):
    store: str
    date: str          # YYYY-MM-DD
    salesperson: str


class DutyBatch(BaseModel):
    items: list[DutyItem]


# 简单缓存，避免重复解析Excel文件
_sales_cache: dict[str, list] = {}


def _load_sales_lines(path: str):
    if path in _sales_cache:
        return _sales_cache[path]
    raw = load_sales_xlsx(path)
    from salary_engine.models import SalesLine  # noqa: 保留显式引用
    result = [replace(s, store=clean_store(s.store)) for s in raw]
    _sales_cache[path] = result
    return result


def _clear_sales_cache(path: str = None):
    """清除销售数据缓存"""
    if path:
        _sales_cache.pop(path, None)
    else:
        _sales_cache.clear()


@router.post("/months/{month}/infer-duty")
def infer(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    if not m.sales_file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")
    duty = infer_duty([s for s in _load_sales_lines(m.sales_file) if not s.is_return])
    grid = {}
    for (store, d), p in duty.items():
        ds = d.isoformat() if hasattr(d, "isoformat") else str(d)
        grid.setdefault(store, {})[ds] = p if isinstance(p, str) else list(p)
    return grid


@router.put("/months/{month}/duty")
def set_duty(month: str, body: DutyBatch,
             _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    db.query(Duty).filter_by(month=month).delete()
    for it in body.items:
        db.add(Duty(month=month, store=it.store,
                    duty_date=date_type.fromisoformat(it.date), salesperson=it.salesperson))
    m.results_stale = True
    db.commit()
    return {"saved": len(body.items)}


@router.get("/months/{month}/duty")
def get_duty(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Duty).filter_by(month=month).all()
    grid = {}
    for r in rows:
        grid.setdefault(r.store, {})[r.duty_date.isoformat()] = r.salesperson
    return grid


class DutyTransfer(BaseModel):
    from_store: str
    to_store: str
    date: str
    salesperson: str


@router.post("/months/{month}/duty/transfer")
def transfer_duty(
    month: str,
    body: DutyTransfer,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """拖拽排班：人员转移到另一门店，同时转移销售数据"""
    m = _get_month(db, month)
    from backend.app.db import Duty
    from backend.app.services.sales_importer import transfer_sales

    # 更新排班
    db.query(Duty).filter(
        Duty.month == month,
        Duty.store == body.from_store,
        Duty.duty_date == date_type.fromisoformat(body.date),
        Duty.salesperson == body.salesperson,
    ).delete()
    db.add(Duty(
        month=month,
        store=body.to_store,
        duty_date=date_type.fromisoformat(body.date),
        salesperson=body.salesperson,
    ))
    m.results_stale = True
    db.commit()

    # 同步转移销售数据
    transfer_sales(
        db, month, body.salesperson,
        body.from_store, date_type.fromisoformat(body.date),
        body.to_store, date_type.fromisoformat(body.date),
        reason=f"排班调整：从{body.from_store}转移到{body.to_store}"
    )

    return {"transferred": body.salesperson, "from": body.from_store, "to": body.to_store}

from decimal import Decimal
from collections import defaultdict
from salary_engine.importer import load_gift_keys_xlsx, load_sales_xlsx as _load_sales
from salary_engine.calculator import compute, clean_store as _clean
from salary_engine.onduty import infer_duty as _infer
from backend.app.services.engine_bridge import (
    rates_from_db, products_from_db, stores_from_db, targets_from_db,
    duty_override_from_db, days_in_month,
)
from backend.app.db import (
    Result, DetailRow, SalaryPolicyVersion,
    Anomaly, Store, Product, MonthlyTarget,
)


@router.post("/months/{month}/check-anomalies")
def check_anomalies(
    month: str,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """预检6类异常并存入数据库"""
    m = _get_month(db, month)
    if not m.sales_file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")

    from backend.app.services.anomaly_checker import AnomalyChecker

    sales = _load_sales_lines(m.sales_file)

    checker = AnomalyChecker(db, month)

    # 收集销售数据用于丰富异常信息
    store_sales_data: Dict[str, Any] = {}
    product_sales_data: Dict[str, Any] = {}
    for s in sales:
        store = clean_store(s.store)
        if store not in store_sales_data:
            store_sales_data[store] = {"salespersons": set(), "count": 0}
        store_sales_data[store]["salespersons"].add(s.salesperson)
        store_sales_data[store]["count"] += 1

        if s.barcode:
            if s.barcode not in product_sales_data:
                product_sales_data[s.barcode] = {"name": s.product_name, "count": 0}
            product_sales_data[s.barcode]["count"] += 1

    # 异常1: 门店不存在
    store_names = list({clean_store(s.store) for s in sales})
    checker.check_store_exists(store_names, store_sales_data)

    # 异常2: 商品不存在
    barcodes = list({s.barcode for s in sales if s.barcode})
    checker.check_product_exists(barcodes, product_sales_data)

    # 异常3: 门店无目标
    all_stores = db.query(Store).all()
    targeted = set(
        row[0]
        for row in db.query(MonthlyTarget.store).filter(MonthlyTarget.month == month).all()
    )
    checker.check_targets(
        [
            {"name": s.name, "exclude_assessment": s.exclude_assessment, "group": s.group, "store_class": s.store_class}
            for s in all_stores
        ],
        targeted,
    )

    # 异常4: 商品信息不完整
    checker.check_products_complete(barcodes)

    # 清除旧异常
    db.query(Anomaly).filter(Anomaly.month == month).delete()

    # 写入新异常
    anomalies = checker.get_anomalies()
    for a in anomalies:
        from datetime import datetime
        db.add(Anomaly(
            month=a["month"],
            anomaly_type=a["anomaly_type"],
            entity_type=a["entity_type"],
            entity_id=a["entity_id"],
            description=a["description"],
            status="pending",
            created_at=datetime.utcnow(),
        ))
    db.commit()
    return {"total": len(anomalies), "anomalies": anomalies}


def _run_compute(db, month: str):
    """组装引擎入参并执行计算（Task 6 export 复用）。"""
    m = _get_month(db, month)
    if not m.sales_file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")
    # 销售流水以 SalesRecord 为真值源（C2：调班/编辑后立即对计算可见）
    from backend.app.services.engine_bridge import sales_lines_from_db
    sales = sales_lines_from_db(db, month)
    if not sales:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")
    gifts = load_gift_keys_xlsx(m.gifts_file) if m.gifts_file else set()
    # 使用锁定的工资策略版本，若无则用当前激活版本（ADR-009：策略存百分数，边界 ÷100）
    try:
        rate_table = rates_from_db(db, m.policy_version_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    result = compute(
        sales_lines=sales,
        products=products_from_db(db),
        stores=stores_from_db(db),
        targets=targets_from_db(db, month),
        rate_table=rate_table,
        month=month, days=days_in_month(month),
        gift_keys=gifts,
        duty_override=duty_override_from_db(db, month),
    )
    return result


@router.post("/months/{month}/compute")
def do_compute(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """算一次、物化两表（P4 基础）：
    - 聚合 Result（person×store 一行）
    - 逐行 DetailRow（与 SalesRecord 1:1 的提成台账）
    同事务删除-插入-提交，失败回滚；置 status=computed、results_stale=False；
    policy_version_id 仅首次锁定（None 时才写），重算不覆盖（修 H10）。
    """
    result = _run_compute(db, month)
    try:
        db.query(Result).filter_by(month=month).delete()
        db.query(DetailRow).filter_by(month=month).delete()
        for (person, store), v in result.breakdown.items():
            db.add(Result(month=month, person=person, store=store,
                          sales=v["sales"], target=v["target"], achievement=v["achievement"],
                          bucket=v["bucket"], commission=v["commission"]))
        for d in result.details:
            db.add(DetailRow(month=month, sales_record_id=d.sales_record_id, person=d.salesperson,
                             store=d.store, sale_date=d.sale_date, barcode=d.barcode,
                             product_name=d.product_name, tier=d.tier, bucket=d.bucket, rate=d.rate,
                             amount=d.amount, commission=d.commission, tag=d.tag,
                             is_transferred=False))  # 占位，T7.1 按 SalesRecord 回填
        m = db.get(Month, month)
        m.status = "computed"
        m.results_stale = False
        if m.policy_version_id is None:          # 仅首次锁（修 H10），重算不覆盖
            cur = db.query(SalaryPolicyVersion).filter_by(is_current=True).first()
            if cur:
                m.policy_version_id = cur.id
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"details": len(result.details), "warnings": result.warnings,
            "total": round(float(sum(result.commission_by_person.values())), 2)}


@router.get("/months/{month}/results")
def results(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """初版：从 Result 表汇总。Task 6 会扩展（breakdown 排序等）。
    stale=True 表示输入已变更或月份未计算，前端应提示"数据已变更，请重新计算"。
    写侧触发（输入变更 → results_stale=True）在 T5.1 落地。"""
    m = db.get(Month, month)
    rows = db.query(Result).filter_by(month=month).all()
    salary = defaultdict(Decimal)
    breakdown = []
    for r in rows:
        salary[r.person] += r.commission
        breakdown.append({"person": r.person, "store": r.store,
                          "sales": round(float(r.sales), 2),
                          "target": round(float(r.target), 2),
                          "achievement": round(float(r.achievement), 4),
                          "bucket": r.bucket,
                          "commission": round(float(r.commission), 2)})
    salary = sorted(({"person": p, "commission": round(float(c), 2)} for p, c in salary.items()),
                    key=lambda x: x["commission"], reverse=True)
    stale = bool(m is not None and (m.results_stale or m.status != "computed"))
    return {"salary": salary, "breakdown": breakdown, "stale": stale}


def _sales_item(r) -> Dict[str, Any]:
    """把 SalesRecord 映射成前端 SalesItem 全字段字典。
    sales_detail 与 tier_detail 共用（DRY），保证前端抽屉字段契约一致。"""
    return {
        "id": r.id,
        "receipt": r.receipt,
        "src_order": r.src_order,
        "store": r.store,
        "sale_date": r.sale_date.isoformat(),
        "barcode": r.barcode,
        "product_name": r.product_name,
        "qty": float(r.qty),
        "amount": round(float(r.amount), 2),
        "unit_price": round(float(r.unit_price), 2),
        "salesperson": r.salesperson,
        "cashier": r.cashier,
        "is_return": r.is_return,
        "is_online": r.is_online,
        "tag": r.tag,
        "original_store": r.original_store,
        "original_date": r.original_date.isoformat() if r.original_date else None,
        "transfer_reason": r.transfer_reason,
    }


@router.get("/months/{month}/sales-detail")
def sales_detail(month: str, store: str, person: str, date: str,
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    """获取某人某店某天的销售明细（从数据库查询）"""
    from backend.app.db import SalesRecord
    target_date = date_type.fromisoformat(date)

    records = db.query(SalesRecord).filter(
        SalesRecord.month == month,
        SalesRecord.store == store,
        SalesRecord.salesperson == person,
        SalesRecord.sale_date == target_date,
    ).order_by(SalesRecord.receipt, SalesRecord.id).all()

    items = [_sales_item(r) for r in records]
    return {"items": items}


@router.get("/months/{month}/tier-detail")
def tier_detail(month: str, store: str, person: str, bucket: str,
                _: User = Depends(current_user), db: Session = Depends(get_db)):
    """某人某店某档位的逐笔明细（读物化 DetailRow JOIN SalesRecord，零重算，字段与 sales_detail 一致）。
    tier 仍来自 DetailRow（单一真值源，无需重推导）；JOIN SalesRecord 取前端所需全字段。"""
    from backend.app.db import SalesRecord
    rows = (db.query(DetailRow, SalesRecord)
            .join(SalesRecord, SalesRecord.id == DetailRow.sales_record_id)
            .filter(DetailRow.month == month, DetailRow.store == store,
                    DetailRow.person == person, DetailRow.tier == bucket)
            .all())
    items = [_sales_item(sr) for _, sr in rows]
    return {"items": items}


@router.get("/months/{month}/tier-summary")
def tier_summary(month: str, store: str, person: str,
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    """某人某店档位汇总（读物化 DetailRow，零重算；rate 已是 SalaryPolicyVersion 口径）。"""
    rows = db.query(DetailRow).filter_by(month=month, store=store, person=person).all()
    if not rows:
        return {"tiers": [], "total_sales": 0, "total_commission": 0, "bucket": "LT_70", "target": 0,
                "monthly_target": 0, "duty_days": 0}
    bucket = rows[0].bucket
    tier_sales = defaultdict(float); tier_comm = defaultdict(float)
    for d in rows:
        tier_sales[d.tier] += float(d.amount); tier_comm[d.tier] += float(d.commission)
    tgt = db.query(MonthlyTarget).filter_by(month=month, store=store).first()
    monthly_target = float(tgt.target) if tgt else 0
    duty_days = db.query(Duty).filter_by(month=month, store=store, salesperson=person).count()
    personal_target = monthly_target / (days_in_month(month) or 30) * duty_days
    tiers = []
    for name in ["常温高毛", "常温低毛", "低温高毛", "低温低毛", "特价"]:
        rate = next((float(d.rate) for d in rows if d.tier == name), 0.0)
        tiers.append({"name": name, "sales": round(tier_sales.get(name, 0), 2), "rate": rate,
                      "rate_percent": f"{rate * 100:.0f}%", "commission": round(tier_comm.get(name, 0), 2)})
    return {"tiers": tiers, "total_sales": round(sum(tier_sales.values()), 2),
            "total_commission": round(sum(tier_comm.values()), 2), "bucket": bucket,
            "target": round(personal_target, 2), "monthly_target": round(monthly_target, 2),
            "duty_days": duty_days}


import tempfile
import os as _os
from fastapi import Response
from salary_engine.exporter import write_excel


@router.get("/months/{month}/export")
def export(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    result = _run_compute(db, month)   # 重跑得到完整明细
    fd, path = tempfile.mkstemp(suffix=".xlsx")
    _os.close(fd)
    try:
        write_excel(result, path, month=month, db=db)
        with open(path, "rb") as f:
            data = f.read()
    finally:
        _os.remove(path)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="salary_{month}.xlsx"'})
