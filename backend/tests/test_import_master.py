import openpyxl


def _ws(path, header, rows):
    wb = openpyxl.Workbook(); ws = wb.active; ws.append(header)
    for r in rows: ws.append(r)
    wb.save(path)


def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_import_products(tmp_path, client):
    h = auth_header(client)
    info = tmp_path / "info.xlsx"
    _ws(info, ["国际条码", "商品名称", "规格", "类别"], [["6920001", "低温奶", "200ml", "低温奶"]])
    cost = tmp_path / "cost.xlsx"
    _ws(cost, ["商品条码", "商品名称", "销售成本"], [["6920001", "低温奶（件）", "20"]])
    with open(info, "rb") as fi, open(cost, "rb") as fc:
        r = client.post("/import/products", headers=h,
                        files={"info": ("info.xlsx", fi), "cost": ("cost.xlsx", fc)})
    assert r.status_code == 200
    assert r.json()["products"] >= 1
    p = client.get("/products", headers=h).json()
    assert any(x["barcode"] == "6920001" and float(x["cost"]) == 20 for x in p)


def test_import_stores(tmp_path, client):
    h = auth_header(client)
    stores = tmp_path / "stores.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "cfg"
    ws.append(["主管", "类别", "组别", "名称", "本月目标"])
    ws.append(["胡总", "A", "1组", "福景店", 84000])
    wb.save(stores)
    with open(stores, "rb") as f:
        r = client.post("/import/stores", headers=h,
                        data={"sheet": "cfg"}, files={"file": ("stores.xlsx", f)})
    assert r.status_code == 200
    assert r.json()["stores"] >= 1
    s = {x["name"]: x for x in client.get("/stores", headers=h).json()}
    assert s["福景店"]["store_class"] == "A"
