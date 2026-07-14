import os
from salary_engine.cli import main


def test_cli_runs_on_synthetic_data(tmp_path):
    # 用合成的小 xlsx 跑通整条链路，验证不崩、产出文件存在
    import openpyxl

    def write_ws(path, header, rows, sheet=None):
        wb = openpyxl.Workbook(); ws = wb.active
        if sheet: ws.title = sheet
        ws.append(header)
        for r in rows: ws.append(r)
        wb.save(path); return path

    info = write_ws(tmp_path / "info.xlsx",
                    ["国际条码", "商品名称", "规格", "类别"],
                    [["6920001", "低温奶", "200ml", "低温奶"]])
    cost = write_ws(tmp_path / "cost.xlsx",
                    ["商品条码", "商品名称", "销售成本"],
                    [["6920001", "低温奶（件）", "20"]])
    sales = write_ws(tmp_path / "sales.xlsx",
        ["序号", "机构名称", "小票单号", "销售时间", "上传时间", "销售方式", "商品编码",
         "收银员名称", "国际条码", "数量", "销售金额", "销售单价", "商品名称", "营业员名称",
         "订单渠道", "源单号"],
        [["1", "福景店", "R001", "2026-06-01 10:00", "", "销售", "", "高睿",
          "6920001", "1", "3", "3", "低温奶", "高睿", "线下", ""]])
    gifts = write_ws(tmp_path / "gifts.xlsx",
                     ["序号", "订单号", "国际条码", "商品名称"],
                     [["1", "NONE", "0000", "x"]])
    stores = tmp_path / "stores.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "cfg"
    ws.append(["主管", "类别", "组别", "名称", "本月目标"])
    ws.append(["胡总", "A", "1组", "福景店", 3])
    wb.save(stores)

    out = tmp_path / "工资表.xlsx"
    rc = main(["run", "--sales", str(sales), "--gifts", str(gifts),
               "--products-info", str(info), "--cost", str(cost),
               "--stores-file", str(stores), "--stores-sheet", "cfg",
               "--month", "2026-06", "--days", "30", "--out", str(out)])
    assert rc == 0
    assert os.path.exists(out)
