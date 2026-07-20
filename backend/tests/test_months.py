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


def test_reset_clears_detail_and_policy_lock(tmp_path, client, db_session):
    """/reset 必须清掉 Compute 物化的 Result/DetailRow/Anomaly，并解锁 policy_version_id
    + 置 results_stale=True。否则读端点返回 PHANTOM 数据，且 /compute 复用旧锁定策略。"""
    from backend.app.db import Result, DetailRow, Month
    from backend.tests.test_workflow import _setup_computed_month

    h = auth_header(client)
    _setup_computed_month(tmp_path, client, h)  # 建 2026-06 已计算月份

    # 前置：已物化 Result/DetailRow 且锁定了 policy_version_id
    assert db_session.query(Result).filter_by(month="2026-06").count() > 0
    assert db_session.query(DetailRow).filter_by(month="2026-06").count() > 0
    assert db_session.get(Month, "2026-06").policy_version_id is not None

    r = client.post("/months/2026-06/reset", headers=h)
    assert r.status_code == 200, r.text

    db_session.expire_all()
    # DetailRow / Result 已清空
    assert db_session.query(DetailRow).filter_by(month="2026-06").count() == 0, "DetailRow 应被清空"
    assert db_session.query(Result).filter_by(month="2026-06").count() == 0, "Result 应被清空"
    # policy_version_id 已解锁；status 回到 draft；results_stale=True
    m = db_session.get(Month, "2026-06")
    assert m.policy_version_id is None, "policy_version_id 应解锁"
    assert m.results_stale is True, "results_stale 应为 True"
    assert m.status == "draft"
