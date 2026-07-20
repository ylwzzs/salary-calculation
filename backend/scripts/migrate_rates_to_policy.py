"""把 RateVersion.rates（分数）迁入 SalaryPolicyVersion.content.commission_rates（百分数）。

ADR-009：SalaryPolicyVersion 存百分数（与 UI 编辑器一致），而历史 RateVersion.rates
存的是分数（如 "0.13"）。迁移时 ×100 还原为百分数（"13.00"），下游 rates_from_db 再 ÷100。"""
from datetime import date
from decimal import Decimal

from backend.app.db import SessionLocal, RateVersion, SalaryPolicyVersion


def _to_percents(rates: dict) -> dict:
    """{cls:{bucket:{tier: 分数字符串}}} -> {... 百数字符串}。

    归一化为整数字符串（"13" 而非 "13.00"），与 UI 编辑器/种子值一致。
    种子提成比例均为整数百分数（见 salary_engine.rates._RATES），故 int() 安全。"""
    out: dict = {}
    for cls, by_bucket in (rates or {}).items():
        for bucket, by_tier in by_bucket.items():
            for tier, frac in by_tier.items():
                out.setdefault(cls, {}).setdefault(bucket, {})[tier] = str(int(Decimal(str(frac)) * 100))
    return out


def run():
    db = SessionLocal()
    try:
        if db.query(SalaryPolicyVersion).count() == 0:
            cur = db.query(RateVersion).filter_by(is_current=True).first()
            if cur:
                pv = SalaryPolicyVersion(
                    version=1, effective_from=cur.effective_from, is_current=True,
                    content={"margin_rules": {}, "commission_rates": _to_percents(cur.rates)},
                    note="从 RateVersion 迁入", created_by="migration")
                db.add(pv); db.commit()
                print(f"migrated RateVersion v{cur.version} -> SalaryPolicyVersion v1 (fractions x100 -> percents)")
            else:
                print("no current RateVersion to migrate")
        else:
            print("SalaryPolicyVersion already has data; skip")
    finally:
        db.close()


if __name__ == "__main__":
    run()
