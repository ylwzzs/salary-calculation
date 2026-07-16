def test_login_and_protected(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    token = r.json()["token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_protected_requires_token(client):
    assert client.get("/auth/me").status_code == 401


def test_login_wrong_password(client):
    assert client.post("/auth/login", json={"username": "admin", "password": "x"}).status_code == 401
