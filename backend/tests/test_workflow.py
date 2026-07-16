import openpyxl


def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def _sales_xlsx(path):
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["序号", "机构名称", "小票单号", "销售时间", "上传时间", "销售方式", "商品编码",
               "收银员名称", "国际条码", "数量", "销售金额", "销售单价", "商品名称",
               "订单渠道", "源单号"])
    ws.append(["1", "福景店", "R001", "2026-06-01 10:00", "", "销售", "", "高睿",
               "6920001", "1", "3", "3", "低温奶", "线下", ""])
    wb.save(path)


def test_import_sales_and_gifts(tmp_path, client):
    h = auth_header(client)
    client.post("/months", headers=h, json={"month": "2026-06"})
    s = tmp_path / "sales.xlsx"; _sales_xlsx(s)
    with open(s, "rb") as f:
        r = client.post("/months/2026-06/import-sales", headers=h,
                        files={"file": ("sales.xlsx", f)})
    assert r.status_code == 200
    m = client.get("/months/2026-06", headers=h).json()
    assert m["sales_file"] and m["sales_file"].endswith(".xlsx")
