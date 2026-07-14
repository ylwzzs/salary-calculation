"""提成计算主流程（规格 §2、§3）。"""
import re
from collections import defaultdict
from dataclasses import dataclass, field, replace
from datetime import date
from decimal import Decimal

from salary_engine.margin import gross_margin, classify_tier
from salary_engine.rates import achievement_bucket, lookup_rate
from salary_engine.onduty import infer_duty


def clean_store(name: str) -> str:
    """剥离销售流水门店名的 [10026] 前缀和 （来思尔） 供应商后缀，对齐门店档案。"""
    name = str(name)
    name = re.sub(r"^\[[^\]]*\]", "", name)      # 去 [10026] 前缀
    name = re.sub(r"（[^（）]*）$", "", name)      # 去结尾中文括号后缀
    name = re.sub(r"\([^()]*\)$", "", name)       # 去结尾英文括号后缀
    return name.strip()


@dataclass
class DetailRow:
    store: str
    sale_date: date
    salesperson: str
    barcode: str
    product_name: str
    tier: str
    store_class: str
    bucket: str
    rate: Decimal
    amount: Decimal
    commission: Decimal
    flag: str = ""   # "" | "退货未匹配"


@dataclass
class ComputeResult:
    details: list = field(default_factory=list)
    commission_by_person: dict = field(default_factory=dict)
    commission_by_store: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)


def compute(sales_lines, products, stores, targets, rate_table,
            month: str, days: int, gift_keys=None, duty_override=None):
    """主流程。返回 ComputeResult。

    - gift_keys: {(订单号, 条码)} 赠送集合，命中的销售行剔除。
    - duty_override: {(store,date): salesperson} 人工确认当班；为 None 则自动推断。
    """
    gift_keys = gift_keys or set()
    warnings = []

    # 1) 拆分：正常销售/退货；剔除赠送；跳过非乳品；清洗门店名
    sales, returns = [], []
    for ln in sales_lines:
        ln = replace(ln, store=clean_store(ln.store))  # 仅改门店名，保留其余字段
        if (ln.receipt, ln.barcode) in gift_keys:
            continue  # 赠送剔除
        if ln.barcode not in products:
            continue  # 非乳品
        (returns if ln.is_return else sales).append(ln)

    # 2) 退货精确匹配：src_order → 原销售 receipt + 同条码
    sales_by_receipt = defaultdict(list)
    for s in sales:
        sales_by_receipt[(s.receipt, s.barcode)].append(s)
    matched_returns, unmatched_returns = [], []
    for r in returns:
        origs = sales_by_receipt.get((r.src_order, r.barcode), [])
        if r.src_order and origs:
            matched_returns.append((r, origs[0]))
        else:
            unmatched_returns.append(r)

    # 3) 当班表（用已清洗门店名的线下销售推断；人工 override 由 Web 提供）
    duty = duty_override if duty_override is not None else infer_duty(sales)

    # 4) 门店×天的乳品销售额（用于达成率）：正常销售(扣精确退货) + 不匹配退货(负)
    daily_sales = defaultdict(Decimal)
    offset_by_receipt = defaultdict(Decimal)
    for r, orig in matched_returns:
        offset_by_receipt[(orig.receipt, orig.barcode)] += r.amount
    for s in sales:
        net = s.amount + offset_by_receipt.get((s.receipt, s.barcode), Decimal(0))
        daily_sales[(s.store, s.sale_date)] += net
    for r in unmatched_returns:
        daily_sales[(r.store, r.sale_date)] += r.amount  # 负数

    def ach_of(store, d):
        target = targets.get(store, Decimal(0))
        daily_target = (target / days) if (target and days) else Decimal(0)
        if daily_target == 0:
            return Decimal(0), "LT_70"
        ach = daily_sales[(store, d)] / daily_target
        return ach, achievement_bucket(ach)

    # 5) 逐行算提成
    details = []
    comm_person = defaultdict(Decimal)
    comm_store = defaultdict(Decimal)

    # 正常销售行（扣精确退货后的净额）
    for s in sales:
        net = s.amount + offset_by_receipt.get((s.receipt, s.barcode), Decimal(0))
        if net == 0:
            continue
        product = products[s.barcode]
        if product.cost is None:
            warnings.append(f"缺成本: {s.barcode} {s.product_name}")
            continue
        store_obj = stores.get(s.store)
        if store_obj is None:
            warnings.append(f"未知门店: {s.store}")
            continue
        margin = gross_margin(s.unit_price, product.cost)
        tier = classify_tier(product.category, margin)
        _, bucket = ach_of(s.store, s.sale_date)
        rate = lookup_rate(rate_table, store_obj.store_class, bucket, tier)
        commission = net * rate
        sp = _resolve_duty(duty, s.store, s.sale_date, s.salesperson)
        details.append(DetailRow(s.store, s.sale_date, sp, s.barcode, s.product_name,
                                 tier, store_obj.store_class, bucket, rate, net, commission))
        comm_person[sp] += commission
        comm_store[s.store] += commission

    # 不匹配退货：算到退货当日，按当日档比例算负数，标黄
    for r in unmatched_returns:
        product = products[r.barcode]
        store_obj = stores.get(r.store)
        if store_obj is None or product.cost is None:
            warnings.append(f"退货异常(缺数据): {r.barcode} @ {r.store}")
            continue
        margin = gross_margin(r.unit_price, product.cost)
        tier = classify_tier(product.category, margin)
        _, bucket = ach_of(r.store, r.sale_date)
        rate = lookup_rate(rate_table, store_obj.store_class, bucket, tier)
        commission = r.amount * rate  # amount 为负 → 提成负
        sp = _resolve_duty(duty, r.store, r.sale_date, r.salesperson)
        details.append(DetailRow(r.store, r.sale_date, sp, r.barcode, r.product_name,
                                 tier, store_obj.store_class, bucket, rate, r.amount,
                                 commission, flag="退货未匹配"))
        comm_person[sp] += commission
        comm_store[r.store] += commission

    return ComputeResult(details=details,
                         commission_by_person=dict(comm_person),
                         commission_by_store=dict(comm_store),
                         warnings=warnings)


def _resolve_duty(duty, store, d, fallback):
    v = duty.get((store, d))
    if v is None:
        return fallback
    if isinstance(v, list):
        return fallback  # 多人当天：先用该行原营业员，UI 阶段再人工定
    return v
