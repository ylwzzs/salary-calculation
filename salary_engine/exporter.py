"""导出工资表与明细（规格 §8 输出）。"""
from salary_engine.calculator import ComputeResult, DetailRow


def to_salary_rows(result: ComputeResult):
    """按营业员汇总，提成降序。"""
    rows = [{"营业员": sp, "提成合计": amt}
            for sp, amt in result.commission_by_person.items()]
    rows.sort(key=lambda r: r["提成合计"], reverse=True)
    return rows


def to_detail_rows(details):
    return [{
        "门店": d.store, "日期": d.sale_date, "营业员": d.salesperson,
        "条码": d.barcode, "商品": d.product_name, "档位": d.tier,
        "门店类别": d.store_class, "达成档": d.bucket,
        "比例": d.rate, "金额": d.amount, "提成": d.commission,
        "标记": d.flag,
    } for d in details]


def write_excel(result: ComputeResult, out_path: str):
    """用 openpyxl 写两个 sheet：工资表 + 提成明细。"""
    import openpyxl
    wb = openpyxl.Workbook()
    ws1 = wb.active
    ws1.title = "工资表"
    ws1.append(["营业员", "提成合计"])
    for r in to_salary_rows(result):
        ws1.append([r["营业员"], float(r["提成合计"])])
    ws2 = wb.create_sheet("提成明细")
    headers = ["门店", "日期", "营业员", "条码", "商品", "档位", "门店类别",
               "达成档", "比例", "金额", "提成", "标记"]
    ws2.append(headers)
    for r in to_detail_rows(result.details):
        ws2.append([r[h] for h in headers])
    wb.save(out_path)
