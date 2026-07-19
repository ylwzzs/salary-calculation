"""导出辅助函数：从 ComputeResult 构建 Excel 行数据。"""
from collections import defaultdict
from decimal import Decimal


def build_rows_from_breakdown(result, store_map, rate_rates, duty_days_map, target_map, total_days, tier_names):
    """从 result.breakdown 构建按员工分组的行数据。

    返回: [(person, [row_list, ...]), ...]
    每个 row_list 是一个有序列表，对应 Excel 一行的所有列。
    """
    # 按 person 分组
    person_stores = defaultdict(list)
    for (person, store), v in result.breakdown.items():
        person_stores[person].append((store, v))

    # 计算每人总提成，用于排序
    person_totals = {}
    for person, stores in person_stores.items():
        person_totals[person] = sum(v["commission"] for _, v in stores)

    rows = []
    for person in sorted(person_totals, key=lambda p: -float(person_totals[p])):
        stores_data = []
        # 按提成降序排列门店
        store_items = sorted(person_stores[person], key=lambda x: -float(x[1]["commission"]))

        for store, v in store_items:
            # 门店类型
            store_obj = store_map.get(store)
            store_class = store_obj.store_class if store_obj else "A"

            # 考勤天数
            days = duty_days_map.get((person, store), 0)

            # 目标
            monthly_target = target_map.get(store, Decimal(0))
            daily_target = monthly_target / total_days if total_days else Decimal(0)
            actual_target = daily_target * days

            # 销售额与达标率
            sales = v["sales"]
            achievement = v["achievement"]  # Decimal ratio
            bucket = v["bucket"]
            commission = v["commission"]

            # 达标率百分比
            ach_pct = round(float(achievement) * 100, 1) if achievement else 0

            # 达标档位中文名
            bucket_display = _bucket_display(bucket)

            row = [
                person, store, store_class,
                round(float(monthly_target), 2), round(float(daily_target), 2),
                days, round(float(actual_target), 2),
                round(float(sales), 2), ach_pct, bucket_display,
                round(float(commission), 2),
            ]

            # 档位明细：从 details 按 (person, store) 聚合
            tier_sales = defaultdict(Decimal)
            tier_commission = defaultdict(Decimal)
            for d in result.details:
                if d.salesperson == person and d.store == store:
                    tier_sales[d.tier] += d.amount
                    tier_commission[d.tier] += d.commission

            for tier_name in tier_names:
                ts = tier_sales.get(tier_name, Decimal(0))
                tc = tier_commission.get(tier_name, Decimal(0))
                # 查找费率
                rate = rate_rates.get((store_class, bucket, tier_name), Decimal(0))
                rate_pct = f"{float(rate) * 100:.1f}%" if rate else ""
                row.extend([
                    round(float(ts), 2), rate_pct, round(float(tc), 2),
                ])

            stores_data.append(row)

        rows.append((person, stores_data))

    return rows


def _bucket_display(bucket: str) -> str:
    """达标档位代码转中文显示。"""
    mapping = {
        "GE_100": "≥100%",
        "90_100": "90~100%",
        "80_90": "80~90%",
        "70_80": "70~80%",
        "LT_70": "<70%",
    }
    return mapping.get(bucket, bucket)
