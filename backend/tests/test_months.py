def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_create_month_and_copy_targets(client):
    h = auth_header(client)
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A"})
    client.put("/months/2026-06/targets", headers=h, json={"items": [{"store": "福景店", "target": "84000"}]})
    # 建 7 月，复制 6 月目标
    r = client.post("/months", headers=h, json={"month": "2026-07", "copy_from": "2026-06"})
    assert r.status_code == 200
    tg = client.get("/months/2026-07/targets", headers=h).json()
    assert tg["2026-07"]["福景店"] == 84000


def test_list_months(client):
    h = auth_header(client)
    client.post("/months", headers=h, json={"month": "2026-06"})
    r = client.get("/months", headers=h)
    assert r.status_code == 200
    assert any(m["month"] == "2026-06" for m in r.json())
