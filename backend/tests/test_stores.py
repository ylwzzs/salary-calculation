def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_store_upsert_list_and_batch_class(client):
    h = auth_header(client)
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A", "supervisor": "胡总"})
    client.put("/stores/金星店", headers=h, json={"name": "金星店", "group": "3组", "store_class": "B"})
    r = client.post("/stores/batch-class", headers=h, json={"group": "3组", "store_class": "D"})
    assert r.status_code == 200
    assert r.json()["updated"] == 1   # 金星店(3组)改D
    stores = {s["name"]: s for s in client.get("/stores", headers=h).json()}
    assert stores["福景店"]["store_class"] == "A"
    assert stores["金星店"]["store_class"] == "D"
