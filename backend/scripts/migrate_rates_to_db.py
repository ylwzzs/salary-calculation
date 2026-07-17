#!/usr/bin/env python3
"""将salary_engine/rates.py中的提成比例迁移到数据库

迁移脚本从代码中的_RATES常量构建SalaryPolicyVersion记录，
包含margin_rules和commission_rates两部分。
"""
import sys
sys.path.insert(0, '.')

from datetime import date
from sqlalchemy.orm import Session
from backend.app.db import SessionLocal, SalaryPolicyVersion
from salary_engine.rates import _RATES, _TIERS

# 达成率分档
_BUCKETS = ["GE_100", "90_100", "80_90", "70_80", "LT_70"]


def build_content() -> dict:
    """构建完整的内容JSON

    Returns:
        包含margin_rules和commission_rates的字典
    """
    # 毛利率规则 - 根据业务规则定义
    # 常温奶: 高毛利>17%, 低毛利10-17%, 特价<10%
    # 低温奶: 高毛利>15%, 低毛利10-15%, 特价<10%
    margin_rules = {
        "常温奶": {
            "high": {"min": 17, "operator": ">"},
            "low": {"min": 10, "max": 17},
            "special": {"max": 10}
        },
        "低温奶": {
            "high": {"min": 15, "operator": ">"},
            "low": {"min": 10, "max": 15},
            "special": {"max": 10}
        }
    }

    # 提成比例表
    # 结构: {门店类别: {达成率分档: {产品档位: 比例(%)} }}
    commission_rates = {}

    for store_class, by_bucket in _RATES.items():
        commission_rates[store_class] = {}
        for bucket in _BUCKETS:
            vals = by_bucket.get(bucket, [])
            commission_rates[store_class][bucket] = {}
            for tier, val in zip(_TIERS, vals):
                commission_rates[store_class][bucket][tier] = val

    return {
        "margin_rules": margin_rules,
        "commission_rates": commission_rates
    }


def main():
    """主迁移函数"""
    db: Session = SessionLocal()
    try:
        # 检查是否已迁移
        existing = db.query(SalaryPolicyVersion).count()
        if existing > 0:
            print(f"数据库已有 {existing} 个版本，跳过迁移")
            return

        # 创建初始版本
        content = build_content()
        policy = SalaryPolicyVersion(
            version=1,
            effective_from=date(2026, 6, 1),  # 使用合理的生效日期
            is_current=True,
            created_by="system",
            content=content,
            note="从代码迁移的初始版本"
        )
        db.add(policy)
        db.commit()

        print("成功迁移提成比例表到数据库（v1）")
        print(f"   毛利率规则: {len(content['margin_rules'])} 种商品分类")
        print(f"   提成比例表: {len(content['commission_rates'])} 种门店类别")
    finally:
        db.close()


if __name__ == "__main__":
    main()