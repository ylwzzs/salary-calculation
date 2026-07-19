"""把 RateVersion.rates 迁入 SalaryPolicyVersion.content.commission_rates。"""
from datetime import date
from backend.app.db import SessionLocal, RateVersion, SalaryPolicyVersion

def run():
    db = SessionLocal()
    try:
        if db.query(SalaryPolicyVersion).count() == 0:
            cur = db.query(RateVersion).filter_by(is_current=True).first()
            if cur:
                pv = SalaryPolicyVersion(
                    version=1, effective_from=cur.effective_from, is_current=True,
                    content={"margin_rules": {}, "commission_rates": cur.rates or {}},
                    note="从 RateVersion 迁入", created_by="migration")
                db.add(pv); db.commit()
                print(f"migrated RateVersion v{cur.version} -> SalaryPolicyVersion v1")
            else:
                print("no current RateVersion to migrate")
        else:
            print("SalaryPolicyVersion already has data; skip")
    finally:
        db.close()

if __name__ == "__main__":
    run()
