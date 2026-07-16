def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_set_and_get_targets(client):
    h = auth_header(client)
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A"})
    r = client.put("/months/2026-06/targets", headers=h, json={
        "items": [{"store": "福景店", "target": "84000"}]})
    assert r.status_code == 200
    got = client.get("/months/2026-06/targets", headers=h).json()
    assert got["2026-06"]["福景店"] == 84000
