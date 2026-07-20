import openpyxl
from datetime import date
from decimal import Decimal


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


def _line(start, i):
    """构造一条 SalesLine（receipt 由 start+i 决定，便于批量造数据）"""
    from salary_engine.models import SalesLine
    return SalesLine(receipt=f"R{start + i}", src_order=None, store="S",
                     sale_date=date(2026, 1, 1), barcode="B", product_name="奶",
                     qty=1, amount=Decimal(1), unit_price=Decimal(1),
                     is_return=False, is_online=False, cashier="", salesperson="高睿")


def _lines(start, n):
    return [_line(start, i) for i in range(n)]


def test_import_sales_bulk_and_reimport_clears_stale(db_session):
    """T6.1: 批量导入正确性 + 重导清旧行（修 H4）

    - 500 行一次导入 → db_count==500（批量）
    - 同月重导 300 行（R500..R799）→ db_count==300（旧 R0..R499 已清除）
    """
    from backend.app.services.sales_importer import import_sales_to_db
    from backend.app.db import SalesRecord

    db = db_session

    # 首次导入 500 行
    r1 = import_sales_to_db(db, "2026-01", _lines(0, 500), set())
    assert r1["total"] == 500
    assert r1["db_count"] == 500
    assert db.query(SalesRecord).filter_by(month="2026-01").count() == 500

    # 重导 300 行（不同的 receipt）—— H4：旧行应被清除
    r2 = import_sales_to_db(db, "2026-01", _lines(500, 300), set())
    assert r2["total"] == 300
    assert r2["db_count"] == 300  # 不是 800
    # 旧 R0..R499 已不在库中
    assert db.query(SalesRecord).filter_by(month="2026-01", receipt="R0").count() == 0
    assert db.query(SalesRecord).filter_by(month="2026-01", receipt="R499").count() == 0
    # 新行存在
    assert db.query(SalesRecord).filter_by(month="2026-01", receipt="R500").count() == 1
    assert db.query(SalesRecord).filter_by(month="2026-01", receipt="R799").count() == 1


def test_import_sales_bulk_within_file_duplicates(db_session):
    """T6.1: 同一文件内重复键应折叠（upsert 而非报错/重复）"""
    from backend.app.services.sales_importer import import_sales_to_db
    from backend.app.db import SalesRecord

    db = db_session
    # 同一文件里两条完全一样的行（命中唯一约束）
    sales = _lines(0, 1) + _lines(0, 1)
    r = import_sales_to_db(db, "2026-01", sales, set())
    assert r["total"] == 2
    assert r["db_count"] == 1  # 唯一键折叠后只剩 1 行
