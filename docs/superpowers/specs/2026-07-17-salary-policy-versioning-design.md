# 薪酬制度版本管理设计

**创建时间：** 2026-07-17  
**作者：** 张铎  
**状态：** 待审核

---

## 一、概述

### 1.1 背景

当前系统中，提成比例表硬编码在 `salary_engine/rates.py` 中，毛利率分类规则分散在 `margin.py` 和文档中。当需要调整薪酬制度时，需要修改代码并重新部署，缺乏灵活性且无法追溯历史版本。

### 1.2 目标

- 提供可视化的薪酬制度管理界面
- 支持版本控制，保留历史版本
- 版本与薪酬计算记录关联，实现审计追溯
- 支持导出为Excel/PDF/图片

### 1.3 范围

- 毛利率分类规则（常温奶/低温奶的高毛/低毛/特价阈值）
- 提成比例表（门店类别×达成档位×商品档位的3维表格）

---

## 二、核心设计原则

### 2.1 版本不可变性

- **创建新版本**：基于当前生效版本复制内容，修改后保存为独立新版本
- **激活历史版本**：将历史版本重新设为生效状态
- **禁止修改已有版本**：所有已创建的版本内容不可变更

### 2.2 版本唯一性

- 同时只能有一个版本处于"生效中"状态
- 激活新版本时，自动停用旧版本
- 版本号全局唯一，递增分配

### 2.3 版本删除保护

- 当前生效版本不允许删除
- 被薪酬计算记录关联的版本不允许删除
- 至少保留一个版本

### 2.4 计算关联

- 月份创建薪酬计算记录时，锁定当时的生效版本ID
- 历史薪酬记录可追溯到具体版本详情

---

## 三、数据模型

### 3.1 薪酬制度版本表

```python
class SalaryPolicyVersion(Base):
    __tablename__ = "salary_policy_versions"
    
    id = Column(Integer, primary_key=True)
    version = Column(Integer, nullable=False, unique=True)  # 版本号：1, 2, 3...
    effective_from = Column(Date, nullable=False)             # 生效日期
    is_current = Column(Boolean, default=False, index=True)  # 是否当前生效（唯一true）
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(50))                          # 创建人用户名
    
    # 完整内容（JSON格式）
    content = Column(JSON, nullable=False)
    
    note = Column(String(200))  # 版本备注
```

**content字段结构：**

```json
{
  "margin_rules": {
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
  },
  "commission_rates": {
    "A": {
      "GE_100": {"低温低毛": "9", "低温高毛": "13", "常温低毛": "7", "常温高毛": "12", "特价": "1"},
      "90_100": {...},
      "80_90": {...},
      "70_80": {...},
      "LT_70": {...}
    },
    "B": {...},
    "C": {...},
    "D": {...}
  }
}
```

### 3.2 月份表关联

```python
class Month(Base):
    __tablename__ = "months"
    month = Column(String, primary_key=True)
    status = Column(String, default="draft")
    sales_file = Column(String)
    gifts_file = Column(String)
    
    # 关联生效的薪酬制度版本
    policy_version_id = Column(Integer, ForeignKey("salary_policy_versions.id"))
    policy_version = relationship("SalaryPolicyVersion")
    
    created_at = Column(DateTime)
```

---

## 四、页面设计

### 4.1 布局结构

采用左右分栏布局：

**顶部操作栏：**
- 标题：薪酬制度 v3 (生效中)
- 操作按钮：创建新版本 | 导出Excel | 导出PDF | 复制图片

**左侧（30%宽度）- 版本时间线：**

```
版本历史
───────────────
● v3 2026-08-01 [生效中]
  张铎 修改了提成比例
  └─ [激活] [导出]
  
○ v2 2026-07-01 [已关联]
  李秀军 调整了毛利率阈值
  └─ [激活] [导出]
  
○ v1 2026-06-01
  初始版本
  └─ [激活] [导出] [删除]
```

**右侧（70%宽度）- 内容区域：**

```
【毛利率分类规则】

商品分类  正价     低价       特价
常温奶    >17%    10-17%     ≤10%
低温奶    >15%    10-15%     ≤10%

─────────────────────────────────

【提成比例表】

           A类   B类   C类   D类
≥100% 低温低毛  9%   10%   11%   12%
      低温高毛 13%   14%   15%   16%
      常温低毛  7%    8%    9%   10%
      常温高毛 12%   13%   14%   15%
      特价     1%    1%    1%    1%

90-99% 低温低毛  8%    9%   10%   12%
...
```

### 4.2 编辑模式

点击"创建新版本"后进入编辑模式：

```
┌──────────────────────────────────────┐
│ 创建新版本 v4                [保存] [取消] │
├──────────────────────────────────────┤
│ 生效日期：[2026-09-01]                 │
│ 版本备注：[调整提成比例]                │
│                                        │
│ 【毛利率分类规则】（表格可编辑）          │
│ ┌──────┬─────┬─────┬─────┐            │
│ │      │正价 │低价 │特价 │            │
│ ├──────┼─────┼─────┼─────┤            │
│ │常温奶│>17%│10-17%│≤10% │            │
│ │低温奶│>15%│10-15%│≤10% │            │
│ └──────┴─────┴─────┴─────┘            │
│                                        │
│ 【提成比例表】（表格可编辑）              │
│ [表格编辑器]                            │
└──────────────────────────────────────┘
```

### 4.3 空状态

```
┌────────────────────────────────────┐
│ 薪酬制度                            │
│                          [创建首个版本] │
├────────────────────────────────────┤
│                                    │
│      暂无薪酬制度，点击上方按钮创建      │
│                                    │
└────────────────────────────────────┘
```

---

## 五、API设计

### 5.1 端点列表

```
GET    /salary-policies                    # 列出所有版本（按版本号倒序）
GET    /salary-policies/current            # 获取当前生效版本
GET    /salary-policies/{id}               # 获取版本详情
POST   /salary-policies                    # 创建新版本（保存时自动激活）
POST   /salary-policies/{id}/activate      # 激活历史版本
DELETE /salary-policies/{id}               # 删除版本（严格限制）
GET    /salary-policies/{id}/export        # 导出指定版本（?format=xlsx|pdf|png）
```

### 5.2 请求/响应示例

**创建新版本：**

```json
// POST /salary-policies
// Request
{
  "effective_from": "2026-09-01",
  "note": "调整提成比例",
  "content": {
    "margin_rules": {...},
    "commission_rates": {...}
  }
}

// Response
{
  "id": 4,
  "version": 4,
  "effective_from": "2026-09-01",
  "is_current": true,
  "created_at": "2026-08-20T10:00:00",
  "created_by": "张铎",
  "note": "调整提成比例",
  "content": {...}
}
```

**激活历史版本：**

```json
// POST /salary-policies/2/activate
// Response
{
  "id": 2,
  "version": 2,
  "is_current": true,
  "activated_at": "2026-08-20T11:00:00",
  "previous_current": {
    "id": 4,
    "version": 4,
    "is_current": false
  }
}
```

---

## 六、前端组件结构

### 6.1 组件树

```
SalaryPolicy/
├── index.tsx                 # 主页面组件
├── VersionTimeline.tsx      # 左侧版本时间线
├── PolicyContent.tsx        # 右侧内容展示（查看模式）
├── PolicyEditor.tsx         # 编辑模式容器
├── MarginRulesTable.tsx     # 毛利率分类规则表格
├── CommissionRatesTable.tsx # 提成比例表表格
├── ExportButtons.tsx        # 导出按钮组
└── EmptyState.tsx           # 空状态组件
```

### 6.2 状态管理

```typescript
interface State {
  versions: PolicyVersion[];        // 所有版本列表
  currentVersion: PolicyVersion;    // 当前生效版本
  selectedVersion: PolicyVersion;   // 当前查看的版本
  editMode: boolean;                // 是否在编辑模式
  editingContent: PolicyContent;    // 编辑中的内容
  effectiveDate: string;            // 新版本生效日期
  note: string;                     // 版本备注
}
```

### 6.3 关键交互流程

**查看历史版本：**
```
用户点击时间线节点 → 加载该版本详情 → 显示在右侧内容区
```

**创建新版本：**
```
点击"创建新版本" → 复制当前版本内容 → 进入编辑模式 → 修改 → 点击保存 → 
弹出确认框（生效日期、备注）→ 调用API → 自动激活 → 刷新版本列表
```

**激活历史版本：**
```
点击"激活"按钮 → 弹出确认框（显示"将停用当前版本v4"）→ 确认 → 
调用API → 更新is_current状态 → 刷新UI
```

---

## 七、表格编辑器设计

### 7.1 编辑功能

- **单元格编辑**：点击单元格直接输入数字
- **自动格式化**：输入数字自动添加%后缀显示
- **键盘导航**：Tab键横向移动，方向键自由导航
- **批量填充**：支持Excel式拖拽填充（可选）
- **数据验证**：实时验证0-100范围

### 7.2 特殊处理

- **特价行**：固定1%，显示为灰色不可编辑
- **空值处理**：空单元格显示为"0%"，保存时转为"0"
- **复制粘贴**：支持从Excel复制粘贴数据（可选）

---

## 八、导出功能

### 8.1 导出Excel

- **文件名**：`薪酬制度_v3_2026-08-01.xlsx`
- **工作表**：
  - Sheet1: 毛利率分类规则
  - Sheet2: 提成比例表
- **格式**：参照业绩工资制度.docx的表格样式

### 8.2 导出PDF

- **文件名**：`薪酬制度_v3_2026-08-01.pdf`
- **内容**：
  - 标题：薪酬制度 v3
  - 生效日期：2026-08-01
  - 创建人：张铎
  - 毛利率分类规则表格
  - 提成比例表表格

### 8.3 复制为图片

- **文件名**：`薪酬制度_v3_2026-08-01.png`
- **内容**：当前显示的制度内容截图
- **格式**：包含版本信息的标题栏 + 两个表格

---

## 九、错误处理

### 9.1 版本冲突

**场景**：多用户同时创建新版本  
**处理**：乐观锁 + 版本号唯一约束

```python
# 后端
try:
    next_ver = db.query(SalaryPolicyVersion).count() + 1
    existing = db.query(SalaryPolicyVersion).filter_by(version=next_ver).first()
    if existing:
        raise HTTPException(400, "版本已存在，请重试")
except:
    db.rollback()
    raise
```

### 9.2 数据验证

**前端验证：**

```typescript
// 提成比例：0-100数字
const validateRate = (value: string): boolean => {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0 && num <= 100;
};

// 生效日期：不能早于今天
const validateDate = (date: string): boolean => {
  return new Date(date) >= new Date();
};
```

### 9.3 边界情况

| 场景 | 处理 |
|------|------|
| 首次创建版本 | v1自动设为生效 |
| 删除唯一版本 | 禁止删除，提示"至少保留一个版本" |
| 激活历史版本 | 确认对话框，显示"将停用当前版本v3" |
| 表格单元格为空 | 显示"0%"，保存时转为"0" |

---

## 十、版本删除保护

### 10.1 删除规则

```python
def can_delete_version(version_id: int, db: Session) -> tuple[bool, str]:
    version = db.get(SalaryPolicyVersion, version_id)
    
    # 1. 当前生效版本不可删除
    if version.is_current:
        return False, "不能删除当前生效版本"
    
    # 2. 检查月份关联
    months_using = db.query(Month).filter(
        Month.policy_version_id == version_id
    ).all()
    
    if months_using:
        months_list = ", ".join([m.month for m in months_using])
        return False, f"该版本已被月份 {months_list} 使用，无法删除"
    
    # 3. 至少保留一个版本
    total = db.query(SalaryPolicyVersion).count()
    if total <= 1:
        return False, "至少保留一个版本"
    
    return True, ""
```

### 10.2 UI显示逻辑

- 当前生效版本：不显示删除按钮
- 被关联版本：不显示删除按钮，灰色提示关联信息
- 未关联版本：显示删除按钮，点击时二次确认

---

## 十一、测试策略

### 11.1 后端测试

- **单元测试**：版本创建、激活、删除保护逻辑
- **集成测试**：API端点全流程测试
- **并发测试**：多用户同时创建版本的冲突处理

### 11.2 前端测试

- **组件测试**：表格编辑器交互
- **E2E测试**：创建版本 → 编辑 → 保存 → 验证列表更新
- **边界测试**：空状态、删除保护、版本切换

---

## 十二、实施优先级

### 12.1 MVP（必须）

1. 数据库表创建与迁移
2. 后端API（列表、详情、创建、激活）
3. 前端页面（时间线 + 内容展示）
4. 表格编辑器（基础编辑功能）
5. 版本保存与自动激活

### 12.2 后续迭代（可选）

1. 导出Excel功能
2. 导出PDF功能
3. 复制为图片功能
4. 表格批量填充
5. 版本对比功能

---

## 十三、风险与约束

### 13.1 技术约束

- JSON字段存储结构化数据，查询效率低于关系表
- 版本内容可能较大（提成比例表有100+单元格）

### 13.2 业务约束

- 版本不可修改，只能创建新版本（符合审计要求）
- 删除保护确保历史数据完整性

### 13.3 缓解措施

- 添加索引优化查询性能
- 版本数量上限建议（如不超过100个）
- 定期归档超期版本（可选）