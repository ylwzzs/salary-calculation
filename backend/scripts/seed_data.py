"""一键导入维表初始数据（商品、门店、目标、费率表）。

用法:
    python -m backend.scripts.seed_data [--month YYYY-MM]

默认导入 2026-06 月份数据。可选 --month 覆盖。
"""
import argparse
import os
import sys

# 确保项目根目录在 sys.path 中
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from backend.app.db import SessionLocal, init_db, Product, Store, MonthlyTarget, Month
from backend.app.services.import_master import upsert_products, upsert_stores
from salary_engine.importer import load_products_xlsx, load_stores_xlsx

DATA_DIR = ROOT  # Excel 文件在项目根目录

PRODUCTS_INFO = os.path.join(DATA_DIR, "商品信息表（常温低温）.xlsx")
PRODUCTS_COST = os.path.join(DATA_DIR, "销售成本.xlsx")
STORES_FILE = os.path.join(DATA_DIR, "分组.xlsx")
STORES_SHEET = "2026.6全部（正确）"


def seed_products(db):
    """导入商品维表（信息 + 成本）。"""
    print(f"[products] 读取 {os.path.basename(PRODUCTS_INFO)} + {os.path.basename(PRODUCTS_COST)} ...")
    products = load_products_xlsx(PRODUCTS_INFO, PRODUCTS_COST)
    n = upsert_products(db, products)
    print(f"[products] 导入 {n} 条商品记录")
    return n


def seed_stores(db, month: str):
    """导入门店维表 + 月度目标。"""
    print(f"[stores] 读取 {os.path.basename(STORES_FILE)} / {STORES_SHEET} ...")
    stores, targets = load_stores_xlsx(STORES_FILE, STORES_SHEET)
    n = upsert_stores(db, stores, targets, month=month)
    print(f"[stores] 导入 {n} 条门店记录 + {len(targets)} 条月度目标")
    return n


def ensure_month(db, month: str):
    """确保 months 记录存在。"""
    row = db.get(Month, month)
    if row is None:
        db.add(Month(month=month))
        db.commit()
        print(f"[months] 创建月份记录 {month}")
    else:
        print(f"[months] 月份 {month} 已存在，跳过")


def main():
    parser = argparse.ArgumentParser(description="导入维表初始数据")
    parser.add_argument("--month", default="2026-06", help="目标月份 (默认 2026-06)")
    args = parser.parse_args()

    # 检查文件是否存在
    for f in [PRODUCTS_INFO, PRODUCTS_COST, STORES_FILE]:
        if not os.path.exists(f):
            print(f"[ERROR] 文件不存在: {f}")
            sys.exit(1)

    init_db()
    db = SessionLocal()
    try:
        seed_products(db)
        seed_stores(db, args.month)
        ensure_month(db, args.month)
        print("\n[OK] 维表数据导入完成")
    finally:
        db.close()


if __name__ == "__main__":
    main()
