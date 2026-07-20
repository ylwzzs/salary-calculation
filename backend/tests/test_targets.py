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


def test_targets_crud_sets_stale(tmp_path, client, db_session):
    """CRUD 端点（POST/PUT/DELETE /targets...）必须把所属月份的 results_stale 置 True（T5.1）。
    覆盖：create / batch_create / update / delete_one / delete_month。"""
    from backend.app.db import Month
    from backend.tests.test_workflow import _setup_computed_month

    h = auth_header(client)
    _setup_computed_month(tmp_path, client, h)  # 建 2026-06 已计算月份（stale=False）

    def _reset_stale():
        db_session.get(Month, "2026-06").results_stale = False
        db_session.commit()

    def _assert_stale(label):
        db_session.expire_all()
        m = db_session.get(Month, "2026-06")
        assert m.results_stale is True, f"{label} 后 results_stale 应为 True"

    # POST /targets —— 创建一条新目标（新门店，避免与已存在目标冲突）
    _reset_stale()
    client.put("/stores/新店", headers=h, json={"name": "新店", "group": "1组", "store_class": "A"})
    r = client.post("/targets", headers=h,
                    json={"month": "2026-06", "store": "新店", "target": "100"})
    assert r.status_code == 201, r.text
    _assert_stale("POST /targets")

    # PUT /targets/{id} —— 改已存在目标的金额
    _reset_stale()
    tid = r.json()["id"]
    r2 = client.put(f"/targets/{tid}", headers=h, params={"target_value": "200"})
    assert r2.status_code == 200, r2.text
    _assert_stale("PUT /targets/{id}")

    # POST /targets/batch —— 整月批量初始化（先清空 2026-06 目标避免冲突）
    _reset_stale()
    client.delete("/targets/month/2026-06", headers=h)
    db_session.get(Month, "2026-06").results_stale = False
    db_session.commit()
    rb = client.post("/targets/batch", headers=h, params={"month": "2026-06"})
    assert rb.status_code == 201, rb.text
    _assert_stale("POST /targets/batch")

    # DELETE /targets/{id}
    _reset_stale()
    some = client.get("/targets", headers=h, params={"month": "2026-06"}).json()
    assert some, "批量后应有目标可供删除"
    rd = client.delete(f"/targets/{some[0]['id']}", headers=h)
    assert rd.status_code == 200, rd.text
    _assert_stale("DELETE /targets/{id}")

    # DELETE /targets/month/{month}
    _reset_stale()
    rm = client.delete("/targets/month/2026-06", headers=h)
    assert rm.status_code == 200, rm.text
    _assert_stale("DELETE /targets/month/{month}")
