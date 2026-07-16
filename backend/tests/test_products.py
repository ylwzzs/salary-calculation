def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_product_upsert_and_list(client):
    h = auth_header(client)
    r = client.put("/products/6920001", headers=h, json={
        "barcode": "6920001", "name": "低温奶", "spec": "200ml", "category": "低温奶", "cost": 2})
    assert r.status_code == 200
    r = client.get("/products", headers=h)
    assert r.status_code == 200
    assert any(p["barcode"] == "6920001" for p in r.json())


def test_products_require_auth(client):
    assert client.get("/products").status_code == 401
