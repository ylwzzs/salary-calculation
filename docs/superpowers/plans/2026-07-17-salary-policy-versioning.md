# 薪酬制度版本管理实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现薪酬制度的可视化版本管理，支持提成比例表和毛利率分类规则的编辑、版本控制、导出功能。

**Architecture:** 
- 后端：新增SalaryPolicyVersion表，JSON存储完整制度内容
- 前端：左右分栏布局（时间线+内容），表格编辑器支持单元格编辑
- 版本控制：版本不可修改，创建新版本自动激活，删除保护检查关联

**Tech Stack:** Python FastAPI + SQLAlchemy + React TypeScript + shadcn/ui + openpyxl

---

## File Structure

**Backend Create:**
- `backend/app/routers/salary_policies.py` - API端点
- `backend/app/schemas/salary_policy.py` - Pydantic schemas  
- `backend/tests/test_salary_policies.py` - 单元测试
- `backend/scripts/migrate_rates_to_db.py` - 数据迁移

**Backend Modify:**
- `backend/app/db.py` - 添加SalaryPolicyVersion模型，修改Month模型
- `backend/app/main.py` - 注册新路由

**Frontend Create:**
- `frontend/src/pages/SalaryPolicy.tsx` - 主页面（包含所有子组件）

**Frontend Modify:**
- `frontend/src/Layout.tsx` - 添加导航项
- `frontend/src/App.tsx` - 添加路由
- `frontend/src/api.ts` - 添加API客户端

---

## Task 1: 后端数据模型与Schema

**Files:**
- Modify: `backend/app/db.py`
- Create: `backend/app/schemas/salary_policy.py`

- [ ] **Step 1: 在db.py中添加SalaryPolicyVersion模型**

在 `backend/app/db.py` 的 `RateVersion` 类之后添加：

```python
class SalaryPolicyVersion(Base):
    __tablename__ = "salary_policy_versions"
    
    id = Column(Integer, primary_key=True)
    version = Column(Integer, nullable=False, unique=True)
    effective_from = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(50))
    content = Column(JSON, nullable=False)
    note = Column(String(200))
```

- [ ] **Step 2: 在db.py中修改Month模型添加关联**

在 `Month` 类中添加：

```python
policy_version_id = Column(Integer, ForeignKey("salary_policy_versions.id"))
policy_version = relationship("SalaryPolicyVersion")
```

- [ ] **Step 3: 创建Pydantic schemas**

创建文件 `backend/app/schemas/salary_policy.py`:

```python
from datetime import date
from pydantic import BaseModel
from typing import Optional, Dict, Any

class SalaryPolicyContent(BaseModel):
    margin_rules: Dict[str, Any]
    commission_rates: Dict[str, Any]

class SalaryPolicyOut(BaseModel):
    id: int
    version: int
    effective_from: date
    is_current: bool
    created_at: str
    created_by: Optional[str]
    content: SalaryPolicyContent
    note: Optional[str]
    
    class Config:
        from_attributes = True

class SalaryPolicyCreate(BaseModel):
    effective_from: date
    note: Optional[str] = None
    content: SalaryPolicyContent

class SalaryPolicySummary(BaseModel):
    id: int
    version: int
    effective_from: date
    is_current: bool
    created_by: Optional[str]
    note: Optional[str]
    used_by_months: list[str] = []
    
    class Config:
        from_attributes = True
```

- [ ] **Step 4: 提交模型变更**

```bash
git add backend/app/db.py backend/app/schemas/salary_policy.py
git commit -m "feat: 添加SalaryPolicyVersion数据模型和Schema"
```

---

## Task 2: 后端API实现（CRUD）

**Files:**
- Create: `backend/app/routers/salary_policies.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 创建API路由文件**

创建 `backend/app/routers/salary_policies.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date

from backend.app.auth import current_user
from backend.app.db import get_db, SalaryPolicyVersion, Month, User
from backend.app.schemas.salary_policy import (
    SalaryPolicyOut, SalaryPolicyCreate, SalaryPolicySummary
)

router = APIRouter(prefix="/salary-policies", tags=["salary-policies"])


@router.get("", response_model=list[SalaryPolicySummary])
def list_policies(_: User = Depends(current_user), db: Session = Depends(get_db)):
    versions = db.query(SalaryPolicyVersion).order_by(SalaryPolicyVersion.version.desc()).all()
    result = []
    for v in versions:
        months_using = db.query(Month).filter(Month.policy_version_id == v.id).all()
        result.append({
            "id": v.id,
            "version": v.version,
            "effective_from": v.effective_from,
            "is_current": v.is_current,
            "created_by": v.created_by,
            "note": v.note,
            "used_by_months": [m.month for m in months_using]
        })
    return result


@router.get("/current", response_model=SalaryPolicyOut)
def get_current(_: User = Depends(current_user), db: Session = Depends(get_db)):
    current = db.query(SalaryPolicyVersion).filter_by(is_current=True).first()
    if not current:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "无生效版本")
    return current


@router.get("/{policy_id}", response_model=SalaryPolicyOut)
def get_policy(policy_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)):
    policy = db.get(SalaryPolicyVersion, policy_id)
    if not policy:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "版本不存在")
    return policy


@router.post("", response_model=SalaryPolicyOut, status_code=status.HTTP_201_CREATED)
def create_policy(body: SalaryPolicyCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # 计算新版本号
    next_ver = (db.query(SalaryPolicyVersion).count() or 0) + 1
    
    # 检查版本号冲突
    existing = db.query(SalaryPolicyVersion).filter_by(version=next_ver).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "版本已存在，请重试")
    
    # 停用旧版本
    db.query(SalaryPolicyVersion).filter_by(is_current=True).update({"is_current": False})
    
    # 创建新版本
    policy = SalaryPolicyVersion(
        version=next_ver,
        effective_from=body.effective_from,
        is_current=True,
        created_by=user.username,
        content=body.content.model_dump(),
        note=body.note
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.post("/{policy_id}/activate", response_model=SalaryPolicyOut)
def activate_policy(policy_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    policy = db.get(SalaryPolicyVersion, policy_id)
    if not policy:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "版本不存在")
    
    # 停用旧版本
    db.query(SalaryPolicyVersion).filter_by(is_current=True).update({"is_current": False})
    
    # 激活指定版本
    policy.is_current = True
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/{policy_id}")
def delete_policy(policy_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)):
    policy = db.get(SalaryPolicyVersion, policy_id)
    if not policy:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "版本不存在")
    
    # 检查是否为当前生效版本
    if policy.is_current:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "不能删除当前生效版本")
    
    # 检查是否被月份关联
    months_using = db.query(Month).filter(Month.policy_version_id == policy_id).all()
    if months_using:
        months_list = ", ".join([m.month for m in months_using])
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"该版本已被月份 {months_list} 使用，无法删除")
    
    # 检查是否为唯一版本
    total = db.query(SalaryPolicyVersion).count()
    if total <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "至少保留一个版本")
    
    db.delete(policy)
    db.commit()
    return {"deleted": policy_id}
```

- [ ] **Step 2: 在main.py中注册路由**

在 `backend/app/main.py` 中添加导入和注册：

```python
# 在导入区域添加
from backend.app.routers import salary_policies

# 在其他router注册之后添加
app.include_router(salary_policies.router)
```

- [ ] **Step 3: 提交API实现**

```bash
git add backend/app/routers/salary_policies.py backend/app/main.py
git commit -m "feat: 薪酬制度版本管理API（列表、创建、激活、删除）"
```

---

## Task 3: 后端单元测试

**Files:**
- Create: `backend/tests/test_salary_policies.py`

- [ ] **Step 1: 创建测试文件**

创建 `backend/tests/test_salary_policies.py`:

```python
import pytest
from datetime import date
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.db import SessionLocal, SalaryPolicyVersion


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    db = SessionLocal()
    yield db
    db.close()


class TestSalaryPolicies:
    
    def test_list_empty(self, client):
        response = client.get("/salary-policies")
        assert response.status_code == 200
        assert response.json() == []
    
    def test_create_first_version(self, client):
        response = client.post("/salary-policies", json={
            "effective_from": "2026-08-01",
            "note": "初始版本",
            "content": {
                "margin_rules": {
                    "常温奶": {"high": {"min": 17, "operator": ">"}, "low": {"min": 10, "max": 17}, "special": {"max": 10}},
                    "低温奶": {"high": {"min": 15, "operator": ">"}, "low": {"min": 10, "max": 15}, "special": {"max": 10}}
                },
                "commission_rates": {
                    "A": {"GE_100": {"低温低毛": "9", "低温高毛": "13", "常温低毛": "7", "常温高毛": "12", "特价": "1"}},
                    "B": {"GE_100": {"低温低毛": "10", "低温高毛": "14", "常温低毛": "8", "常温高毛": "13", "特价": "1"}},
                    "C": {"GE_100": {"低温低毛": "11", "低温高毛": "15", "常温低毛": "9", "常温高毛": "14", "特价": "1"}},
                    "D": {"GE_100": {"低温低毛": "12", "低温高毛": "16", "常温低毛": "10", "常温高毛": "15", "特价": "1"}}
                }
            }
        })
        assert response.status_code == 201
        data = response.json()
        assert data["version"] == 1
        assert data["is_current"] is True
    
    def test_get_current(self, client):
        # 先创建一个版本
        client.post("/salary-policies", json={
            "effective_from": "2026-08-01",
            "content": {"margin_rules": {}, "commission_rates": {}}
        })
        
        response = client.get("/salary-policies/current")
        assert response.status_code == 200
        assert response.json()["is_current"] is True
    
    def test_activate_old_version(self, client):
        # 创建两个版本
        v1 = client.post("/salary-policies", json={
            "effective_from": "2026-07-01",
            "content": {"margin_rules": {}, "commission_rates": {}}
        }).json()
        
        v2 = client.post("/salary-policies", json={
            "effective_from": "2026-08-01",
            "content": {"margin_rules": {}, "commission_rates": {}}
        }).json()
        
        # v2应该是当前版本
        assert v2["is_current"] is True
        
        # 激活v1
        response = client.post(f"/salary-policies/{v1['id']}/activate")
        assert response.status_code == 200
        assert response.json()["is_current"] is True
        
        # v2应该不再是当前版本
        v2_check = client.get(f"/salary-policies/{v2['id']}").json()
        assert v2_check["is_current"] is False
    
    def test_delete_current_fails(self, client):
        v1 = client.post("/salary-policies", json={
            "effective_from": "2026-08-01",
            "content": {"margin_rules": {}, "commission_rates": {}}
        }).json()
        
        response = client.delete(f"/salary-policies/{v1['id']}")
        assert response.status_code == 400
        assert "不能删除当前生效版本" in response.json()["detail"]
```

- [ ] **Step 2: 运行测试**

```bash
pytest backend/tests/test_salary_policies.py -v
```

Expected: 所有测试通过

- [ ] **Step 3: 提交测试**

```bash
git add backend/tests/test_salary_policies.py
git commit -m "test: 薪酬制度版本管理单元测试"
```

---

## Task 4: 数据迁移脚本

**Files:**
- Create: `backend/scripts/migrate_rates_to_db.py`

- [ ] **Step 1: 创建迁移脚本**

创建 `backend/scripts/migrate_rates_to_db.py`:

```python
#!/usr/bin/env python3
"""将salary_engine/rates.py中的提成比例迁移到数据库"""
import sys
sys.path.insert(0, '.')

from datetime import date
from sqlalchemy.orm import Session
from backend.app.db import SessionLocal, SalaryPolicyVersion
from salary_engine.rates import _RATES, _TIERS


def build_content():
    """构建完整的内容JSON"""
    # 毛利率规则
    margin_rules = {
        "常温奶": {
            "high": {"min": 17, "operator": ">"},
            "low": {"min": 10, "max": 17},
            "special": {"max": 10}
        },
        "低温奶": {
            "high": {"min": 15, "operator": ">"},
            "low": {"min": 10, "max": 15},
            "special": {"max": 10}
        }
    }
    
    # 提成比例表
    commission_rates = {}
    for cls in ["A", "B", "C", "D"]:
        commission_rates[cls] = {}
        for bucket in ["GE_100", "90_100", "80_90", "70_80", "LT_70"]:
            commission_rates[cls][bucket] = {}
            rates = _RATES[cls][bucket]
            for i, tier in enumerate(_TIERS):
                commission_rates[cls][bucket][tier] = str(rates[i])
    
    return {
        "margin_rules": margin_rules,
        "commission_rates": commission_rates
    }


def main():
    db: Session = SessionLocal()
    
    try:
        # 检查是否已有版本
        existing = db.query(SalaryPolicyVersion).count()
        if existing > 0:
            print(f"数据库已有 {existing} 个版本，跳过迁移")
            return
        
        # 创建初始版本
        content = build_content()
        policy = SalaryPolicyVersion(
            version=1,
            effective_from=date(2026, 6, 1),
            is_current=True,
            created_by="system",
            content=content,
            note="从代码迁移的初始版本"
        )
        db.add(policy)
        db.commit()
        
        print("✅ 成功迁移提成比例表到数据库（v1）")
        print(f"   毛利率规则: {len(content['margin_rules'])} 种商品分类")
        print(f"   提成比例表: {len(content['commission_rates'])} 种门店类别")
        
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行迁移脚本**

```bash
cd backend && python scripts/migrate_rates_to_db.py
```

Expected: "✅ 成功迁移提成比例表到数据库（v1）"

- [ ] **Step 3: 提交迁移脚本**

```bash
git add backend/scripts/migrate_rates_to_db.py
git commit -m "feat: 提成比例表数据迁移脚本"
```

---

## Task 5: 前端API客户端

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: 添加薪酬制度API客户端**

在 `frontend/src/api.ts` 文件末尾添加：

```typescript
// —— 薪酬制度版本管理 ——
export interface SalaryPolicyContent {
  margin_rules: Record<string, any>;
  commission_rates: Record<string, any>;
}

export interface SalaryPolicyVersion {
  id: number;
  version: number;
  effective_from: string;
  is_current: boolean;
  created_at: string;
  created_by?: string;
  content: SalaryPolicyContent;
  note?: string;
}

export interface SalaryPolicySummary {
  id: number;
  version: number;
  effective_from: string;
  is_current: boolean;
  created_by?: string;
  note?: string;
  used_by_months: string[];
}

export const salaryPolicyApi = {
  list: () => http.get<SalaryPolicySummary[]>("/salary-policies").then(r => r.data),
  getCurrent: () => http.get<SalaryPolicyVersion>("/salary-policies/current").then(r => r.data),
  get: (id: number) => http.get<SalaryPolicyVersion>(`/salary-policies/${id}`).then(r => r.data),
  create: (data: {
    effective_from: string;
    note?: string;
    content: SalaryPolicyContent;
  }) => http.post<SalaryPolicyVersion>("/salary-policies", data).then(r => r.data),
  activate: (id: number) => http.post<SalaryPolicyVersion>(`/salary-policies/${id}/activate`).then(r => r.data),
  delete: (id: number) => http.delete(`/salary-policies/${id}`).then(r => r.data),
};
```

- [ ] **Step 2: 提交API客户端**

```bash
git add frontend/src/api.ts
git commit -m "feat: 薪酬制度版本管理API客户端"
```

---

## Task 6: 前端主页面

**Files:**
- Create: `frontend/src/pages/SalaryPolicy.tsx`
- Modify: `frontend/src/Layout.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 创建薪酬制度页面**

创建 `frontend/src/pages/SalaryPolicy.tsx`:

```typescript
import { useEffect, useState } from "react";
import { salaryPolicyApi, type SalaryPolicyVersion, type SalaryPolicySummary } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Save, X, FileSpreadsheet, FileText, Image } from "lucide-react";
import { Block, BlockTitle } from "@/components/Block";
import { toast } from "sonner";

export default function SalaryPolicy() {
  const [versions, setVersions] = useState<SalaryPolicySummary[]>([]);
  const [currentVersion, setCurrentVersion] = useState<SalaryPolicyVersion | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState<any>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await salaryPolicyApi.list();
      setVersions(data);
      if (data.length > 0) {
        const current = data.find(v => v.is_current);
        if (current) {
          setSelectedId(current.id);
          const detail = await salaryPolicyApi.get(current.id);
          setCurrentVersion(detail);
        }
      }
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, []);

  const handleSelect = async (id: number) => {
    if (editMode) return;
    setSelectedId(id);
    const detail = await salaryPolicyApi.get(id);
    setCurrentVersion(detail);
  };

  const handleCreateNew = () => {
    if (!currentVersion) {
      toast.error("无当前版本可复制");
      return;
    }
    setEditContent(JSON.parse(JSON.stringify(currentVersion.content)));
    setEffectiveDate("");
    setNote("");
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!effectiveDate) {
      toast.error("请填写生效日期");
      return;
    }
    try {
      await salaryPolicyApi.create({
        effective_from: effectiveDate,
        note: note || undefined,
        content: editContent
      });
      toast.success("版本已保存");
      setEditMode(false);
      loadVersions();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "保存失败");
    }
  };

  const handleActivate = async (id: number) => {
    if (!confirm("确定激活此版本？当前生效版本将被停用。")) return;
    try {
      await salaryPolicyApi.activate(id);
      toast.success("已激活");
      loadVersions();
    } catch {
      toast.error("激活失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除此版本？")) return;
    try {
      await salaryPolicyApi.delete(id);
      toast.success("已删除");
      loadVersions();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "删除失败");
    }
  };

  const updateRate = (cls: string, bucket: string, tier: string, value: string) => {
    setEditContent(prev => ({
      ...prev,
      commission_rates: {
        ...prev.commission_rates,
        [cls]: {
          ...prev.commission_rates[cls],
          [bucket]: {
            ...prev.commission_rates[cls][bucket],
            [tier]: value
          }
        }
      }
    }));
  };

  const CLASSES = ["A", "B", "C", "D"];
  const BUCKETS = ["GE_100", "90_100", "80_90", "70_80", "LT_70"];
  const TIERS = ["低温低毛", "低温高毛", "常温低毛", "常温高毛", "特价"];

  return (
    <div className="space-y-5">
      <Block>
        <div className="flex items-center justify-between">
          <BlockTitle>
            薪酬制度
            {currentVersion && (
              <Badge variant="outline" className="ml-2">
                v{currentVersion.version} {currentVersion.is_current && "(生效中)"}
              </Badge>
            )}
          </BlockTitle>
          <div className="flex gap-2">
            {!editMode && (
              <>
                <Button size="sm" onClick={handleCreateNew} disabled={versions.length === 0}>
                  创建新版本
                </Button>
                {currentVersion && (
                  <>
                    <Button size="sm" variant="outline">
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />导出Excel
                    </Button>
                    <Button size="sm" variant="outline">
                      <FileText className="w-3.5 h-3.5 mr-1" />导出PDF
                    </Button>
                    <Button size="sm" variant="outline">
                      <Image className="w-3.5 h-3.5 mr-1" />复制图片
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </Block>

      <div className="flex gap-5">
        {/* 左侧时间线 */}
        <div className="w-64 shrink-0">
          <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
            <h3 className="text-sm font-medium text-zinc-500 mb-2">版本历史</h3>
            {versions.map(v => (
              <div key={v.id} className={`p-2 rounded cursor-pointer transition-colors ${
                selectedId === v.id ? "bg-blue-50 border border-blue-200" : "hover:bg-zinc-50"
              }`} onClick={() => handleSelect(v.id)}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${v.is_current ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  <span className="text-sm font-medium">v{v.version}</span>
                  {v.is_current && <Badge className="text-[10px]">生效中</Badge>}
                </div>
                <div className="text-xs text-zinc-400 mt-1">{v.effective_from}</div>
                {v.used_by_months.length > 0 && (
                  <div className="text-xs text-zinc-400 mt-0.5">已关联</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1">
          {editMode ? (
            <Block>
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-4 items-center">
                  <div>
                    <label className="text-xs text-zinc-500">生效日期</label>
                    <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className="h-8 w-40" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">版本备注</label>
                    <Input value={note} onChange={e => setNote(e.target.value)} placeholder="可选" className="h-8 w-48" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave}><Save className="w-3.5 h-3.5 mr-1" />保存</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditMode(false)}><X className="w-3.5 h-3.5 mr-1" />取消</Button>
                </div>
              </div>

              {/* 毛利率规则 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-zinc-700 mb-2">毛利率分类规则</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品分类</TableHead>
                      <TableHead>正价</TableHead>
                      <TableHead>低价</TableHead>
                      <TableHead>特价</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {["常温奶", "低温奶"].map(cat => (
                      <TableRow key={cat}>
                        <TableCell className="font-medium">{cat}</TableCell>
                        <TableCell>{editContent?.margin_rules?.[cat]?.high?.min || ">"}%</TableCell>
                        <TableCell>{editContent?.margin_rules?.[cat]?.low?.min || ""}-{editContent?.margin_rules?.[cat]?.low?.max || ""}%</TableCell>
                        <TableCell>≤{editContent?.margin_rules?.[cat]?.special?.max || ""}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 提成比例表 */}
              <div>
                <h3 className="text-sm font-medium text-zinc-700 mb-2">提成比例表 (%)</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>达成档位</TableHead>
                        <TableHead>商品档位</TableHead>
                        {CLASSES.map(c => <TableHead key={c} className="text-center">{c}类</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {BUCKETS.map(bucket => (
                        TIERS.map((tier, i) => (
                          <TableRow key={`${bucket}-${tier}`}>
                            {i === 0 && (
                              <TableCell rowSpan={5} className="font-medium">
                                {bucket === "GE_100" ? "≥100%" : bucket === "LT_70" ? "<70%" : bucket.replace("_", "-") + "%"}
                              </TableCell>
                            )}
                            <TableCell>{tier}</TableCell>
                            {CLASSES.map(cls => (
                              <TableCell key={cls} className="p-1">
                                <Input
                                  type="number"
                                  value={editContent?.commission_rates?.[cls]?.[bucket]?.[tier] || ""}
                                  onChange={e => updateRate(cls, bucket, tier, e.target.value)}
                                  className="h-7 w-14 text-center"
                                  disabled={tier === "特价"}
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </Block>
          ) : currentVersion ? (
            <Block>
              {/* 毛利率规则 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-zinc-700 mb-2">毛利率分类规则</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品分类</TableHead>
                      <TableHead>正价</TableHead>
                      <TableHead>低价</TableHead>
                      <TableHead>特价</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {["常温奶", "低温奶"].map(cat => (
                      <TableRow key={cat}>
                        <TableCell className="font-medium">{cat}</TableCell>
                        <TableCell>&gt;{currentVersion.content.margin_rules[cat]?.high?.min}%</TableCell>
                        <TableCell>{currentVersion.content.margin_rules[cat]?.low?.min}-{currentVersion.content.margin_rules[cat]?.low?.max}%</TableCell>
                        <TableCell>≤{currentVersion.content.margin_rules[cat]?.special?.max}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 提成比例表 */}
              <div>
                <h3 className="text-sm font-medium text-zinc-700 mb-2">提成比例表 (%)</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>达成档位</TableHead>
                        <TableHead>商品档位</TableHead>
                        {CLASSES.map(c => <TableHead key={c} className="text-center">{c}类</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {BUCKETS.map(bucket => (
                        TIERS.map((tier, i) => (
                          <TableRow key={`${bucket}-${tier}`}>
                            {i === 0 && (
                              <TableCell rowSpan={5} className="font-medium">
                                {bucket === "GE_100" ? "≥100%" : bucket === "LT_70" ? "<70%" : bucket.replace("_", "-") + "%"}
                              </TableCell>
                            )}
                            <TableCell>{tier}</TableCell>
                            {CLASSES.map(cls => (
                              <TableCell key={cls} className="text-center">
                                {currentVersion.content.commission_rates?.[cls]?.[bucket]?.[tier] || "-"}%
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </Block>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-200 p-12 text-center text-zinc-400 text-sm">
              暂无薪酬制度，点击上方「创建新版本」开始
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在Layout.tsx添加导航项**

在 `frontend/src/Layout.tsx` 的 nav 数组中添加：

```typescript
import { Target } from "lucide-react"; // 添加导入

const nav = [
  { path: "/months", label: "月度计算", icon: Calendar },
  { path: "/salary-policy", label: "薪酬制度", icon: Target },  // 新增
  { path: "/targets", label: "月度目标", icon: Target },
  { path: "/products", label: "商品档案", icon: Package },
  { path: "/stores", label: "门店信息", icon: Store },
];
```

- [ ] **Step 3: 在App.tsx添加路由**

在 `frontend/src/App.tsx` 中添加：

```typescript
import SalaryPolicy from "./pages/SalaryPolicy"; // 添加导入

// 在Route中添加
<Route path="/salary-policy" element={<SalaryPolicy />} />
```

- [ ] **Step 4: 提交前端页面**

```bash
git add frontend/src/pages/SalaryPolicy.tsx frontend/src/Layout.tsx frontend/src/App.tsx
git commit -m "feat: 薪酬制度版本管理页面（时间线+表格编辑器）"
```

---

## Task 7: 验证与集成测试

**Files:**
- Test: 手动测试

- [ ] **Step 1: 重启后端服务**

```bash
lsof -ti:8000 | xargs kill -9 2>/dev/null
source .venv/bin/activate && python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

- [ ] **Step 2: 运行数据迁移**

```bash
cd backend && python scripts/migrate_rates_to_db.py
```

Expected: "✅ 成功迁移提成比例表到数据库（v1）"

- [ ] **Step 3: 访问前端页面**

打开浏览器访问 `http://localhost:5173/salary-policy`

Expected:
- 看到版本时间线（左侧）
- 看到毛利率规则和提成比例表（右侧）
- v1显示为"生效中"

- [ ] **Step 4: 测试创建新版本**

1. 点击"创建新版本"
2. 修改生效日期为明天
3. 修改几个提成比例值
4. 点击保存
5. 验证v2创建成功并自动激活

Expected: v2成为当前生效版本，v1变为历史

- [ ] **Step 5: 测试激活历史版本**

1. 点击v1版本
2. 点击"激活"
3. 确认对话框
4. 验证v1重新激活，v2停用

Expected: 历史版本可重新激活

- [ ] **Step 6: 提交验证**

```bash
git add -A
git commit -m "test: 薪酬制度版本管理集成验证通过"
```

---

## Plan Complete

计划已完成并保存到 `docs/superpowers/plans/2026-07-17-salary-policy-versioning.md`

**两种执行方式：**

**1. Subagent-Driven (推荐)** - 我派发子代理逐任务执行，每个任务后审查

**2. Inline Execution** - 在此会话中使用executing-plans批量执行

选择哪种方式？