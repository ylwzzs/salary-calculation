"""端到端 CLI：
salary-engine run --sales X --gifts Y --products-info P --cost C \
  --stores-file S --stores-sheet SH --month 2026-06 --days 30 --out 工资表.xlsx
"""
import argparse
import sys

from salary_engine.importer import (load_products_xlsx, load_stores_xlsx,
                                    load_sales_xlsx, load_gift_keys_xlsx)
from salary_engine.rates import seed_rate_table
from salary_engine.calculator import compute
from salary_engine.exporter import write_excel


def main(argv=None):
    p = argparse.ArgumentParser(prog="salary-engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run")
    run.add_argument("--sales", required=True)
    run.add_argument("--gifts", required=True)
    run.add_argument("--products-info", required=True)
    run.add_argument("--cost", required=True)
    run.add_argument("--stores-file", required=True)
    run.add_argument("--stores-sheet", required=True)
    run.add_argument("--month", required=True)
    run.add_argument("--days", type=int, required=True)
    run.add_argument("--out", default="工资表.xlsx")
    args = p.parse_args(argv)

    products = load_products_xlsx(args.products_info, args.cost)
    stores, targets = load_stores_xlsx(args.stores_file, args.stores_sheet)
    sales = load_sales_xlsx(args.sales)
    gifts = load_gift_keys_xlsx(args.gifts)
    result = compute(sales, products, stores, targets, seed_rate_table(),
                     month=args.month, days=args.days, gift_keys=gifts)
    write_excel(result, args.out)
    print(f"已生成 {args.out}；明细 {len(result.details)} 行；{len(result.warnings)} 条预警")
    for w in result.warnings[:20]:
        print("  ⚠️", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
