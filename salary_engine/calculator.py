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
    person_sales: dict = field(default_factory=dict)        # 个人月度业绩
    person_target: dict = field(default_factory=dict)       # 个人月度目标
    person_achievement: dict = field(default_factory=dict)  # 个人月度达成率
    warnings: list = field(default_factory=list)


def compute(sales_lines, products, stores, targets, rate_table,
            month: str, days: int, gift_keys=None, duty_override=None):
    """主流程。返回 ComputeResult。

    - gift_keys: {(订单号, 条码)} 赠送集合，命中的销售行剔除。
    - duty_override: {(store,date): salesperson} 人工确认当班；为 None 则自动推断。
    """
    gift_keys = gift_keys or set()
    warnings = []
    missing_target_stores = set()

    # 1) 清洗门店名；剔除赠送；跳过非乳品；拆分销售/退货
    sales, returns = [], []
    for ln in sales_lines:
        ln = replace(ln, store=clean_store(ln.store))  # 仅改门店名，保留其余字段
        if (ln.receipt, ln.barcode) in gift_keys:
            continue  # 赠送剔除
        if ln.barcode not in products:
            continue  # 非乳品
        (returns if ln.is_return else sales).append(ln)

    # 2) 按 (receipt, barcode) 聚合销售；精确匹配的退货(src_order+条码命中)并入同组，
    #    冲减『该组净额』而非逐行——避免一张小票上同条码多行被重复冲减
    groups = defaultdict(lambda: {"sales": [], "returns": []})
    for s in sales:
        groups[(s.receipt, s.barcode)]["sales"].append(s)
    unmatched_returns = []
    for r in returns:
        g = groups.get((r.src_order, r.barcode))
        if r.src_order and g and g["sales"]:
            g["returns"].append(r)  # 精确匹配：并入原销售组
        else:
            unmatched_returns.append(r)

    # 3) 当班表（用已清洗门店名的线下销售推断；人工 override 由 Web 提供）
    duty = duty_override if duty_override is not None else infer_duty(sales)

    def group_net(g):
        return (sum((s.amount for s in g["sales"]), Decimal(0))
                + sum((r.amount for r in g["returns"]), Decimal(0)))

    # 4) 门店×天乳品销售额（达成率用）：各组净额 + 不匹配退货(负)
    daily_sales = defaultdict(Decimal)
    for g in groups.values():
        if not g["sales"]:
            continue
        s0 = g["sales"][0]
        daily_sales[(s0.store, s0.sale_date)] += group_net(g)
    for r in unmatched_returns:
        daily_sales[(r.store, r.sale_date)] += r.amount  # 负数

    # 5) 个人月度达成率（规格 §2.4）：按人聚合其所有当班(店×天)的业绩与目标
    person_sales = defaultdict(Decimal)
    person_target = defaultdict(Decimal)
    for (s, d), net in daily_sales.items():
        p = _resolve_duty(duty, s, d, None)
        if p is None:
            continue  # 无当班人（如纯线上天）：不进个人聚合，其销售按笔 fallback 计
        person_sales[p] += net
        tgt = targets.get(s)
        if not tgt:
            missing_target_stores.add(s)
        else:
            person_target[p] += tgt / days if days else Decimal(0)

    person_ach, person_bucket = {}, {}
    for p, tgt in person_target.items():
        ach = person_sales[p] / tgt if tgt else Decimal(0)
        person_ach[p] = ach
        person_bucket[p] = achievement_bucket(ach)

    # 6) 逐组算提成：达成档用『该人月度档』，门店类别按本笔销售发生的门店
    details = []
    comm_person = defaultdict(Decimal)
    comm_store = defaultdict(Decimal)

    # 正常销售组（扣精确退货后的净额）
    for g in groups.values():
        if not g["sales"]:
            continue
        net = group_net(g)
        if net == 0:
            continue
        s0 = g["sales"][0]  # 代表行（同组门店/日期/商品一致）
        product = products[s0.barcode]
        if product.cost is None:
            warnings.append(f"缺成本: {s0.barcode} {s0.product_name}")
            continue
        store_obj = stores.get(s0.store)
        if store_obj is None:
            warnings.append(f"未知门店: {s0.store}")
            continue
        margin = gross_margin(s0.unit_price, product.cost)
        tier = classify_tier(product.category, margin)
        sp = _resolve_duty(duty, s0.store, s0.sale_date, s0.salesperson)
        bucket = person_bucket.get(sp, "LT_70")
        rate = lookup_rate(rate_table, store_obj.store_class, bucket, tier)
        commission = net * rate
        details.append(DetailRow(s0.store, s0.sale_date, sp, s0.barcode, s0.product_name,
                                 tier, store_obj.store_class, bucket, rate, net, commission))
        comm_person[sp] += commission
        comm_store[s0.store] += commission

    # 不匹配退货：算到退货当日，按该人月度档比例算负数，标黄
    for r in unmatched_returns:
        product = products[r.barcode]
        store_obj = stores.get(r.store)
        if store_obj is None or product.cost is None:
            warnings.append(f"退货异常(缺数据): {r.barcode} @ {r.store}")
            continue
        margin = gross_margin(r.unit_price, product.cost)
        tier = classify_tier(product.category, margin)
        sp = _resolve_duty(duty, r.store, r.sale_date, r.salesperson)
        bucket = person_bucket.get(sp, "LT_70")
        rate = lookup_rate(rate_table, store_obj.store_class, bucket, tier)
        commission = r.amount * rate  # amount 为负 → 提成负
        details.append(DetailRow(r.store, r.sale_date, sp, r.barcode, r.product_name,
                                 tier, store_obj.store_class, bucket, rate, r.amount,
                                 commission, flag="退货未匹配"))
        comm_person[sp] += commission
        comm_store[r.store] += commission

    for store in sorted(missing_target_stores):
        warnings.append(f"缺月度目标: {store}")

    return ComputeResult(details=details,
                         commission_by_person=dict(comm_person),
                         commission_by_store=dict(comm_store),
                         person_sales=dict(person_sales),
                         person_target=dict(person_target),
                         person_achievement=person_ach,
                         warnings=warnings)


def _resolve_duty(duty, store, d, fallback):
    v = duty.get((store, d))
    if v is None:
        return fallback
    if isinstance(v, list):
        return sorted(v)[0]  # 多人当天：确定性取一人（UI 阶段可人工改）
    return v
