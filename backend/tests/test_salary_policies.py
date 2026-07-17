"""薪酬制度版本 API 单元测试。"""
from datetime import date


def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


# 测试用的薪酬制度内容
SAMPLE_CONTENT = {
    "margin_rules": {
        "常温奶": {"high": {"min": 17}, "low": {"min": 10, "max": 17}, "special": {"max": 10}},
        "低温奶": {"high": {"min": 15}, "low": {"min": 10, "max": 15}, "special": {"max": 10}}
    },
    "commission_rates": {
        "A": {"GE_100": {"低温低毛": "9", "低温高毛": "13", "常温低毛": "7", "常温高毛": "12", "特价": "1"}},
        "B": {"GE_100": {"低温低毛": "10", "低温高毛": "14", "常温低毛": "8", "常温高毛": "13", "特价": "1"}}
    }
}


def test_list_empty(client):
    """空列表返回 []。"""
    h = auth_header(client)
    r = client.get("/salary-policies", headers=h)
    assert r.status_code == 200
    assert r.json() == []


def test_create_first_version(client):
    """创建第一个版本，验证 is_current=True, version=1。"""
    h = auth_header(client)
    r = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT,
        "note": "初始版本"
    })
    assert r.status_code == 201
    data = r.json()
    assert data["version"] == 1
    assert data["is_current"] is True
    assert data["created_by"] == "admin"
    assert data["note"] == "初始版本"
    assert data["content"] == SAMPLE_CONTENT


def test_create_second_version(client):
    """创建第二个版本，验证 version=2，第一个变为 inactive。"""
    h = auth_header(client)
    # 创建第一个版本
    r1 = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT
    })
    assert r1.status_code == 201
    v1_id = r1.json()["id"]

    # 创建第二个版本
    r2 = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-06-01",
        "content": SAMPLE_CONTENT,
        "note": "版本2"
    })
    assert r2.status_code == 201
    data2 = r2.json()
    assert data2["version"] == 2
    assert data2["is_current"] is True

    # 验证第一个版本变为 inactive
    r1_check = client.get(f"/salary-policies/{v1_id}", headers=h)
    assert r1_check.json()["is_current"] is False

    # 验证列表中有两个版本
    r_list = client.get("/salary-policies", headers=h)
    assert len(r_list.json()) == 2


def test_get_current(client):
    """获取当前激活的版本。"""
    h = auth_header(client)
    client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT
    })

    r = client.get("/salary-policies/current", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["is_current"] is True
    assert data["version"] == 1


def test_get_by_id(client):
    """根据 ID 获取特定版本。"""
    h = auth_header(client)
    r_create = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT,
        "note": "测试版本"
    })
    policy_id = r_create.json()["id"]

    r = client.get(f"/salary-policies/{policy_id}", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == policy_id
    assert data["note"] == "测试版本"


def test_get_by_id_not_found(client):
    """获取不存在的版本返回 404。"""
    h = auth_header(client)
    r = client.get("/salary-policies/9999", headers=h)
    assert r.status_code == 404


def test_activate_old_version(client):
    """激活历史版本，原当前版本变为 inactive。"""
    h = auth_header(client)
    # 创建两个版本
    r1 = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT
    })
    v1_id = r1.json()["id"]

    r2 = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-06-01",
        "content": SAMPLE_CONTENT
    })
    v2_id = r2.json()["id"]

    # 此时 v2 是当前版本
    assert client.get("/salary-policies/current", headers=h).json()["id"] == v2_id

    # 激活 v1
    r_activate = client.post(f"/salary-policies/{v1_id}/activate", headers=h)
    assert r_activate.status_code == 200
    data = r_activate.json()
    assert data["id"] == v1_id
    assert data["is_current"] is True

    # 验证 v2 变为 inactive
    v2_check = client.get(f"/salary-policies/{v2_id}", headers=h)
    assert v2_check.json()["is_current"] is False

    # 验证 current 返回 v1
    assert client.get("/salary-policies/current", headers=h).json()["id"] == v1_id


def test_delete_current_fails(client):
    """不能删除当前激活的版本（返回 400）。"""
    h = auth_header(client)
    r_create = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT
    })
    policy_id = r_create.json()["id"]

    r = client.delete(f"/salary-policies/{policy_id}", headers=h)
    assert r.status_code == 400
    assert "当前激活" in r.json()["detail"]


def test_delete_used_fails(client):
    """不能删除已被月份使用的版本（返回 400）。"""
    from backend.app.db import Base, Month, SalaryPolicyVersion, get_db
    from backend.app.main import app
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    h = auth_header(client)
    # 创建版本
    r_create = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT
    })
    v1_id = r_create.json()["id"]

    # 创建第二个版本使其成为当前版本，v1 变为 inactive
    r2 = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-02-01",
        "content": SAMPLE_CONTENT
    })
    assert r2.status_code == 201

    # 创建一个月份并关联到 v1 - 使用测试数据库的 session
    r_month = client.post("/months", headers=h, json={"month": "2026-01"})
    assert r_month.status_code == 200

    # 获取测试数据库的 session（通过 dependency override）
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        month = db.query(Month).filter_by(month="2026-01").first()
        month.policy_version_id = v1_id
        db.commit()
    finally:
        pass  # fixture 会清理

    # 尝试删除 v1
    r_delete = client.delete(f"/salary-policies/{v1_id}", headers=h)
    assert r_delete.status_code == 400
    assert "已被月份使用" in r_delete.json()["detail"] or "2026-01" in r_delete.json()["detail"]


def test_delete_last_fails(client):
    """不能删除唯一剩余的版本。"""
    h = auth_header(client)
    # 创建一个版本
    r_create = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT
    })
    v1_id = r_create.json()["id"]

    # 创建第二个版本，让 v1 变为 inactive
    r2 = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-02-01",
        "content": SAMPLE_CONTENT
    })
    v2_id = r2.json()["id"]

    # 删除 v1（可以，因为不是当前且未使用）
    r_delete_v1 = client.delete(f"/salary-policies/{v1_id}", headers=h)
    assert r_delete_v1.status_code == 200

    # 现在只剩 v2，且是当前版本
    # 尝试删除 v2 应该失败（是当前版本）
    r_delete_v2 = client.delete(f"/salary-policies/{v2_id}", headers=h)
    assert r_delete_v2.status_code == 400
    # 可能因为"当前激活"或"唯一剩余"失败
    detail = r_delete_v2.json()["detail"]
    assert "当前激活" in detail or "唯一剩余" in detail


def test_delete_success(client):
    """成功删除非当前、未使用、非唯一的版本。"""
    h = auth_header(client)
    # 创建两个版本
    r1 = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-01-01",
        "content": SAMPLE_CONTENT
    })
    v1_id = r1.json()["id"]

    r2 = client.post("/salary-policies", headers=h, json={
        "effective_from": "2026-02-01",
        "content": SAMPLE_CONTENT
    })
    # v2 是当前版本，v1 是历史版本

    # 删除 v1
    r_delete = client.delete(f"/salary-policies/{v1_id}", headers=h)
    assert r_delete.status_code == 200
    assert r_delete.json()["ok"] is True

    # 验证列表中只剩一个
    r_list = client.get("/salary-policies", headers=h)
    assert len(r_list.json()) == 1
    assert r_list.json()[0]["id"] == r2.json()["id"]

    # 验证通过 ID 获取返回 404
    r_get = client.get(f"/salary-policies/{v1_id}", headers=h)
    assert r_get.status_code == 404


def test_current_not_found(client):
    """没有激活版本时获取 current 返回 404。"""
    h = auth_header(client)
    # 没有创建任何版本
    r = client.get("/salary-policies/current", headers=h)
    assert r.status_code == 404