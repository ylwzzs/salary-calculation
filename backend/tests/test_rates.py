def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_seed_and_activate(client):
    h = auth_header(client)
    versions = client.get("/rate-versions", headers=h).json()
    assert len(versions) >= 1
    cur = [v for v in versions if v["is_current"]]
    assert len(cur) == 1   # 种子版本即当前


def test_create_and_activate_new_version(client):
    h = auth_header(client)
    rates = {"A": {"GE_100": {"低温高毛": "0.20"}}}
    r = client.post("/rate-versions", headers=h, json={"effective_from": "2026-07-01", "rates": rates})
    assert r.status_code == 200
    new_id = r.json()["id"]
    assert client.get("/rate-versions", headers=h).json()[-1]["is_current"] is False
    a = client.post(f"/rate-versions/{new_id}/activate", headers=h)
    assert a.status_code == 200
    assert a.json()["is_current"] is True
    # 旧的不再是 current
    assert len([v for v in client.get("/rate-versions", headers=h).json() if v["is_current"]]) == 1
