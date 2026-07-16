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


def test_infer_and_confirm_duty(tmp_path, client):
    h = auth_header(client)
    client.post("/months", headers=h, json={"month": "2026-06"})
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A"})
    s = tmp_path / "sales.xlsx"; _sales_xlsx(s)
    with open(s, "rb") as f:
        client.post("/months/2026-06/import-sales", headers=h, files={"file": ("sales.xlsx", f)})
    grid = client.post("/months/2026-06/infer-duty", headers=h).json()
    assert "福景店" in grid and "2026-06-01" in grid["福景店"]
    # 确认
    r = client.put("/months/2026-06/duty", headers=h, json={
        "items": [{"store": "福景店", "date": "2026-06-01", "salesperson": "高睿"}]})
    assert r.status_code == 200
    got = client.get("/months/2026-06/duty", headers=h).json()
    assert got["福景店"]["2026-06-01"] == "高睿"


def test_compute_and_result(tmp_path, client):
    h = auth_header(client)
    client.post("/months", headers=h, json={"month": "2026-06"})
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A"})
    client.put("/products/6920001", headers=h, json={
        "barcode": "6920001", "name": "低温奶", "spec": "200ml", "category": "低温奶", "cost": "2"})
    client.put("/months/2026-06/targets", headers=h, json={"items": [{"store": "福景店", "target": "3"}]})
    s = tmp_path / "sales.xlsx"; _sales_xlsx(s)
    with open(s, "rb") as f:
        client.post("/months/2026-06/import-sales", headers=h, files={"file": ("sales.xlsx", f)})
    client.post("/months/2026-06/infer-duty", headers=h)
    client.put("/months/2026-06/duty", headers=h, json={
        "items": [{"store": "福景店", "date": "2026-06-01", "salesperson": "高睿"}]})
    r = client.post("/months/2026-06/compute", headers=h)
    assert r.status_code == 200
    res = client.get("/months/2026-06/results", headers=h).json()
    # 目标3/天0.1，卖3→达成3000%→GE_100；A低温高毛(单价3成本2=33%>15%)13%→0.39
    assert any(x["person"] == "高睿" and abs(x["commission"] - 0.39) < 0.01 for x in res["salary"])
