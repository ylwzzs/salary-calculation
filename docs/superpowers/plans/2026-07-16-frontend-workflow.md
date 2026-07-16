# Web 前端月度工作台 Implementation Plan (Plan 3b / 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 给前端补上月度工作流界面：月度列表（建月复制上月目标）、5 步工作台（导入销售/让利→配置目标→当班确认→计算→结果）、当班「门店×日期」网格（多人工单下拉确认）、结果看板（工资表+明细+导出）。完成后是完整的 Web 系统。

**Architecture:** 复用 3a 的 `api.ts`/`auth.tsx`/`Layout.tsx`。新增 `pages/Months.tsx`（列表）和 `pages/MonthWorkspace.tsx`（工作台，内含各步骤子组件）。扩展 `api.ts` 加月度/工作流端点。当班网格用 AntD Table 动态生成「门店行 × 日期列」，多人工单渲染为 Select 选择（拖拽为后续增强）。

**Tech Stack:** 复用 3a（React 19 + AntD 6 + react-router-dom 6 + axios + vitest）。

**对应规格：** §6 月度工作台、当班确认网格、结果看板。

---

## File Structure（新增/修改）

```
frontend/src/
├── api.ts                    # 修改：追加 months/targets/workflow 端点
├── App.tsx                   # 修改：加 /months 与 /months/:month 路由
├── Layout.tsx                # 修改：侧边栏加「月度计算」入口
├── pages/
│   ├── Months.tsx            # 新：月度列表 + 建月
│   ├── MonthWorkspace.tsx    # 新：5步工作台
│   ├── steps/
│   │   ├── ImportStep.tsx    # 导入销售/让利
│   │   ├── TargetsStep.tsx   # 配置月度目标
│   │   ├── DutyStep.tsx      # 当班网格
│   │   └── ResultsStep.tsx   # 计算+结果+导出
└── __tests__/api.workflow.test.ts
```

每步一个组件，单一职责。`MonthWorkspace.tsx` 用 AntD Steps 串起来。

---

## Task 1: 扩展 API 客户端（月度/工作流端点）

**Files:**
- Modify: `frontend/src/api.ts`（追加端点与类型）
- Test: `frontend/src/__tests__/api.workflow.test.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/__tests__/api.workflow.test.ts`**

```typescript
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { monthsApi, workflowApi } from "../api";

describe("workflow api shape", () => {
  it("monthsApi has create/list/get", () => {
    expect(typeof monthsApi.create).toBe("function");
    expect(typeof monthsApi.list).toBe("function");
    expect(typeof monthsApi.get).toBe("function");
  });
  it("workflowApi has the month endpoints", () => {
    for (const k of ["importSales", "importGifts", "inferDuty", "getDuty", "setDuty", "compute", "getResults"]) {
      expect(typeof (workflowApi as any)[k]).toBe("function");
    }
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `cd frontend && npx vitest run src/__tests__/api.workflow.test.ts`
Expected: FAIL（导出不存在）

- [ ] **Step 3: 追加到 `frontend/src/api.ts` 末尾**

```typescript
// —— 月度与工作流 ——
export interface MonthInfo {
  month: string;
  status?: string;
  sales_file?: string | null;
  gifts_file?: string | null;
  rate_version_id?: number | null;
}

export const monthsApi = {
  list: () => http.get<MonthInfo[]>("/months").then((r) => r.data),
  create: (month: string, copy_from?: string) =>
    http.post<MonthInfo>("/months", { month, copy_from }).then((r) => r.data),
  get: (month: string) => http.get<MonthInfo>(`/months/${month}`).then((r) => r.data),
};

export const targetsApi = {
  get: (month: string) =>
    http.get<Record<string, Record<string, number>>>(`/months/${month}/targets`).then((r) => r.data),
  set: (month: string, items: { store: string; target: string | number }[]) =>
    http.put(`/months/${month}/targets`, { items }).then((r) => r.data),
};

export type DutyGrid = Record<string, Record<string, string | string[]>>;

export const workflowApi = {
  importSales: (month: string, file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return http.post(`/months/${month}/import-sales`, fd).then((r) => r.data);
  },
  importGifts: (month: string, file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return http.post(`/months/{month}/import-gifts`.replace("{month}", month), fd).then((r) => r.data);
  },
  inferDuty: (month: string) => http.post<DutyGrid>(`/months/${month}/infer-duty`).then((r) => r.data),
  getDuty: (month: string) => http.get<DutyGrid>(`/months/${month}/duty`).then((r) => r.data),
  setDuty: (month: string, items: { store: string; date: string; salesperson: string }[]) =>
    http.put(`/months/${month}/duty`, { items }).then((r) => r.data),
  compute: (month: string) =>
    http.post<{ details: number; warnings: string[]; total: number }>(`/months/${month}/compute`).then((r) => r.data),
  getResults: (month: string) =>
    http.get<{ salary: { person: string; commission: number }[]; breakdown: any[] }>(`/months/${month}/results`).then((r) => r.data),
  downloadExport: async (month: string) => {
    const res = await http.get(`/months/${month}/export`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = `salary_${month}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  },
};
```

- [ ] **Step 4: 运行验证通过 + 构建**

Run: `npx vitest run && npm run build`
Expected: 全部测试 PASS；build 成功。

- [ ] **Step 5: 提交**

```bash
cd /Users/Duo/Documents/MytechCode/salary_calculation
git add frontend/src/api.ts frontend/src/__tests__/api.workflow.test.ts
git commit -m "feat(frontend): 月度/工作流 API 客户端"
```
(End with `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.)

---

## Task 2: 月度列表页（建月复制上月目标）

**Files:**
- Create: `frontend/src/pages/Months.tsx`
- Modify: `frontend/src/App.tsx`（加 `/months` 路由）, `frontend/src/Layout.tsx`（侧边栏入口）

- [ ] **Step 1: 写 `frontend/src/pages/Months.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Space, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { monthsApi, type MonthInfo } from "../api";

export default function Months() {
  const nav = useNavigate();
  const [rows, setRows] = useState<MonthInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setRows(await monthsApi.list()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onCreate = async () => {
    const v = await form.validateFields();
    await monthsApi.create(v.month, v.copy_from || undefined);
    message.success("已建月"); setOpen(false); load();
  };

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>月度计算</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>新建月份</Button>
      </Space>
      <Table rowKey="month" loading={loading} dataSource={rows} onRow={(r) => ({ onClick: () => nav(`/months/${r.month}`), style: { cursor: "pointer" } })}
             columns={[
               { title: "月份", dataIndex: "month" },
               { title: "状态", dataIndex: "status", render: (s) => s === "computed" ? <Tag color="green">已计算</Tag> : <Tag>进行中</Tag> },
               { title: "已导入销售", dataIndex: "sales_file", render: (v) => (v ? "是" : "否") },
               { title: "已导入让利", dataIndex: "gifts_file", render: (v) => (v ? "是" : "否") },
             ]} />
      <Modal title="新建月份" open={open} onOk={onCreate} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="month" label="月份 (YYYY-MM)" rules={[{ required: true }]}>
            <Input placeholder="如 2026-07" />
          </Form.Item>
          <Form.Item name="copy_from" label="复制上月目标 (可选)">
            <Input placeholder="如 2026-06" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: `App.tsx` 加路由（在 protected layout 内加一条）**

在 `App.tsx` 的 protected `<Route>` 块里增加：
```typescript
import Months from "./pages/Months";
// ...在 <Route path="/stores" .../> 之后加：
<Route path="/months" element={<Months />} />
<Route path="/months/:month" element={<MonthWorkspace />} />
```
（`MonthWorkspace` 在 Task 3 创建；本任务先建一个占位 `pages/MonthWorkspace.tsx` 导出 `<h2>月度工作台</h2>` 以便编译。）

- [ ] **Step 3: `Layout.tsx` 侧边栏加「月度计算」入口**

把 `items` 改为：
```typescript
const items = [
  { key: "/months", label: "月度计算" },
  { key: "/products", label: "商品档案" },
  { key: "/stores", label: "门店信息" },
];
```
并把默认重定向 `/` → `/months`（在 App.tsx 把 `<Navigate to="/products" />` 改成 `<Navigate to="/months" />`）。

- [ ] **Step 4: 建占位 `frontend/src/pages/MonthWorkspace.tsx`**

```typescript
export default function MonthWorkspace() {
  return <h2>月度工作台（Task 3 实现）</h2>;
}
```

- [ ] **Step 5: 构建 + 测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build 成功；测试 PASS。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/pages/Months.tsx frontend/src/pages/MonthWorkspace.tsx frontend/src/App.tsx frontend/src/Layout.tsx
git commit -m "feat(frontend): 月度列表页（建月复制上月目标）"
```
(End with `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.)

---

## Task 3: 工作台外壳 + 导入步骤 + 配置目标步骤

**Files:**
- Create: `frontend/src/pages/steps/ImportStep.tsx`, `TargetsStep.tsx`
- Modify: `frontend/src/pages/MonthWorkspace.tsx`（替换占位为 Steps 外壳）

- [ ] **Step 1: 写 `frontend/src/pages/steps/ImportStep.tsx`**

```typescript
import { useState } from "react";
import { Upload, Button, message, Space, Tag } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { workflowApi } from "../../api";

const { Dragger } = Upload;

export default function ImportStep({ month }: { month: string }) {
  const [sales, setSales] = useState(false);
  const [gifts, setGifts] = useState(false);

  const upload = (kind: "sales" | "gifts") => ({
    multiple: false, showUploadList: false, accept: ".xlsx,.xls",
    beforeUpload: (file: File) => {
      (kind === "sales" ? workflowApi.importSales : workflowApi.importGifts)(month, file)
        .then(() => { kind === "sales" ? setSales(true) : setGifts(true); message.success("上传成功"); })
        .catch(() => message.error("上传失败"));
      return false; // 阻止 antd 自动上传
    },
  });

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <div>销售流水 {sales && <Tag color="green">已上传</Tag>}</div>
      <Dragger {...upload("sales")}><p className="ant-upload-drag-icon"><InboxOutlined /></p><p>点击或拖拽「销售流水」xlsx</p></Dragger>
      <div>让利明细（赠送清单） {gifts && <Tag color="green">已上传</Tag>}</div>
      <Dragger {...upload("gifts")}><p className="ant-upload-drag-icon"><InboxOutlined /></p><p>点击或拖拽「让利明细」xlsx（可选）</p></Dragger>
      <Button disabled={!sales} type="primary" onClick={() => location.reload()}>上传完成，刷新状态</Button>
    </Space>
  );
}
```

- [ ] **Step 2: 写 `frontend/src/pages/steps/TargetsStep.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Table, InputNumber, Button, message } from "antd";
import { targetsApi } from "../../api";

interface Row { store: string; target: number; }

export default function TargetsStep({ month }: { month: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await targetsApi.get(month);
      const items = Object.values(data)[0] || {};
      setRows(Object.entries(items).map(([store, target]) => ({ store, target: Number(target) })));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    await targetsApi.set(month, rows.map((r) => ({ store: r.store, target: String(r.target) })));
    message.success("目标已保存");
  };

  return (
    <>
      <Button onClick={save} style={{ marginBottom: 12 }} type="primary">保存目标</Button>
      <Table rowKey="store" loading={loading} dataSource={rows}
             columns={[
               { title: "门店", dataIndex: "store" },
               { title: "月度目标", dataIndex: "target", render: (_, r) => (
                 <InputNumber value={r.target} onChange={(v) => { r.target = Number(v || 0); setRows([...rows]); }} />) },
             ]} />
    </>
  );
}
```

- [ ] **Step 3: 替换 `frontend/src/pages/MonthWorkspace.tsx`（Steps 外壳）**

```typescript
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Steps, Card, Button, Space } from "antd";
import ImportStep from "./steps/ImportStep";
import TargetsStep from "./steps/TargetsStep";
import DutyStep from "./steps/DutyStep";
import ResultsStep from "./steps/ResultsStep";

const STEP_TITLES = ["导入数据", "配置目标", "当班确认", "计算", "结果"];

export default function MonthWorkspace() {
  const { month = "" } = useParams();
  const [cur, setCur] = useState(0);

  return (
    <Card title={`月度工作台 · ${month}`}>
      <Steps current={cur} items={STEP_TITLES.map((t) => ({ title: t }))} style={{ marginBottom: 24 }} />
      <div style={{ marginBottom: 16 }}>
        {cur === 0 && <ImportStep month={month} />}
        {cur === 1 && <TargetsStep month={month} />}
        {cur === 2 && <DutyStep month={month} />}
        {cur === 3 && <ResultsStep month={month} onComputed={() => setCur(4)} />}
        {cur === 4 && <ResultsStep month={month} />}
      </div>
      <Space>
        <Button disabled={cur === 0} onClick={() => setCur(cur - 1)}>上一步</Button>
        <Button disabled={cur === 4} type="primary" onClick={() => setCur(cur + 1)}>下一步</Button>
      </Space>
    </Card>
  );
}
```

> 注：`DutyStep`/`ResultsStep` 在 Task 4/5 实现；本任务先建同名占位文件以编译通过。计算与结果共用 `ResultsStep`（第3步点计算、第4步看结果）。

- [ ] **Step 4: 建占位 `steps/DutyStep.tsx`、`steps/ResultsStep.tsx`**

```typescript
// DutyStep.tsx
export default function DutyStep() { return <p>当班确认（Task 4 实现）</p>; }
// ResultsStep.tsx
export default function ResultsStep() { return <p>结果（Task 5 实现）</p>; }
```

- [ ] **Step 5: 构建 + 测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build 成功；测试 PASS。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/pages/MonthWorkspace.tsx frontend/src/pages/steps
git commit -m "feat(frontend): 工作台外壳 + 导入/配置目标步骤"
```
(End with `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.)

---

## Task 4: 当班确认网格（门店×日期）

**Files:**
- Modify: `frontend/src/pages/steps/DutyStep.tsx`（替换占位）

> infer 返回 `{store:{date: 人名|[多人]}}`。渲染为 AntD Table：左列门店，其余列为各日期；单元格为人名，多人列出渲染为 Select 让用户选一人。确认后把全部 (store,date,salesperson) POST 为 duty。

- [ ] **Step 1: 实现 `frontend/src/pages/steps/DutyStep.tsx`**

```typescript
import { useEffect, useMemo, useState } from "react";
import { Button, Table, Tag, message, Select } from "antd";
import { workflowApi, type DutyGrid } from "../../api";

export default function DutyStep({ month }: { month: string }) {
  const [grid, setGrid] = useState<DutyGrid>({});
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({}); // "store|date" -> 选定人

  const dates = useMemo(() => {
    const s = new Set<string>();
    Object.values(grid).forEach((d) => Object.keys(d).forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [grid]);

  const infer = async () => {
    setLoading(true);
    try { setGrid(await workflowApi.inferDuty(month)); setEdit({}); } finally { setLoading(false); }
  };
  useEffect(() => { infer(); }, []);

  const cellPerson = (store: string, date: string): string => {
    const key = `${store}|${date}`;
    if (key in edit) return edit[key];
    const v = grid[store]?.[date];
    return typeof v === "string" ? v : Array.isArray(v) ? "" : "";
  };

  const dataSource = Object.keys(grid).map((store) => {
    const row: any = { key: store, store };
    for (const d of dates) row[d] = grid[store]?.[d];
    return row;
  });

  const columns: any[] = [
    { title: "门店", dataIndex: "store", fixed: "left", width: 120 },
    ...dates.map((d) => ({
      title: d.slice(5), dataIndex: d, width: 90,
      render: (v: any, row: any) => {
        const store = row.store;
        const key = `${store}|${d}`;
        const cur = cellPerson(store, d);
        if (Array.isArray(v)) {
          // 多人：下拉选
          return (
            <Select size="small" value={cur || undefined} placeholder="选1人"
                    style={{ width: 80 }}
                    options={v.map((p: string) => ({ value: p, label: p }))}
                    onChange={(val) => setEdit({ ...edit, [key]: val })} />
          );
        }
        return cur ? <span>{cur}</span> : <Tag>无</Tag>;
      },
    })),
  ];

  const confirm = async () => {
    const items: { store: string; date: string; salesperson: string }[] = [];
    for (const store of Object.keys(grid)) {
      for (const date of Object.keys(grid[store])) {
        const p = cellPerson(store, date);
        if (p) items.push({ store, date, salesperson: p });
      }
    }
    await workflowApi.setDuty(month, items);
    message.success(`已确认 ${items.length} 条当班`);
  };

  const multiCount = Object.values(grid).reduce(
    (n, d) => n + Object.values(d).filter((v) => Array.isArray(v)).length, 0);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button onClick={infer} loading={loading}>重新推断</Button>
        <span style={{ marginLeft: 12 }}>
          {multiCount > 0 ? <Tag color="red">{multiCount} 个多人当天待选</Tag> : <Tag color="green">无多人冲突</Tag>}
        </span>
        <Button type="primary" onClick={confirm} style={{ marginLeft: 12 }}>确认当班</Button>
      </div>
      <Table columns={columns} dataSource={dataSource} pagination={false} scroll={{ x: "max-content", y: 400 }} size="small" />
    </>
  );
}
```

- [ ] **Step 2: 构建 + 测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build 成功；测试 PASS。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/steps/DutyStep.tsx
git commit -m "feat(frontend): 当班确认网格（门店×日期，多人工单下拉）"
```
(End with `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.)

---

## Task 5: 计算 + 结果看板

**Files:**
- Modify: `frontend/src/pages/steps/ResultsStep.tsx`（替换占位）

> 计算：POST /compute，显示明细数/预警/总额。结果：工资表(按人)+明细(按人×店)，导出按钮。

- [ ] **Step 1: 实现 `frontend/src/pages/steps/ResultsStep.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Button, Table, Statistic, message, Drawer, Space, Tag } from "antd";
import { workflowApi } from "../../api";

export default function ResultsStep({ month, onComputed }: { month: string; onComputed?: () => void }) {
  const [data, setData] = useState<{ salary: { person: string; commission: number }[]; breakdown: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try { setData(await workflowApi.getResults(month)); } catch { setData(null); }
  };
  useEffect(() => { load(); }, []);

  const compute = async () => {
    setBusy(true);
    try {
      const r = await workflowApi.compute(month);
      message.success(`计算完成：${r.details} 条明细，总额 ¥${r.total.toFixed(2)}`);
      onComputed?.(); await load();
    } catch (e: any) { message.error("计算失败：" + (e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" loading={busy} onClick={compute}>计算提成</Button>
        <Button onClick={() => workflowApi.downloadExport(month)}>导出 Excel</Button>
        {data && data.salary.length > 0 && (
          <Statistic title="提成总额" value={data.salary.reduce((s, x) => s + x.commission, 0)} precision={2} prefix="¥" />
        )}
      </Space>
      <Table rowKey="person" size="small"
             dataSource={data?.salary || []}
             columns={[
               { title: "营业员", dataIndex: "person" },
               { title: "提成合计", dataIndex: "commission", render: (v: number) => v.toFixed(2) },
             ]}
             onRow={() => ({ onClick: () => setOpen(true), style: { cursor: "pointer" } })}
             locale={{ emptyText: "尚未计算" }} />
      <Drawer title="提成明细（人×店）" open={open} onClose={() => setOpen(false)} width={720}>
        <Table rowKey={(r) => r.person + r.store} size="small" dataSource={data?.breakdown || []} pagination={{ pageSize: 50 }}
               columns={[
                 { title: "营业员", dataIndex: "person" },
                 { title: "门店", dataIndex: "store" },
                 { title: "业绩", dataIndex: "sales", render: (v: number) => v?.toFixed(0) },
                 { title: "目标", dataIndex: "target", render: (v: number) => v?.toFixed(0) },
                 { title: "达成", dataIndex: "achievement", render: (v: number) => (v * 100).toFixed(0) + "%" },
                 { title: "档", dataIndex: "bucket" },
                 { title: "提成", dataIndex: "commission", render: (v: number) => v.toFixed(2) },
               ]} />
      </Drawer>
    </>
  );
}
```

- [ ] **Step 2: 构建 + 全部测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build 成功；所有前端测试 PASS。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/steps/ResultsStep.tsx
git commit -m "feat(frontend): 计算+结果看板（工资表/明细/导出）"
```
(End with `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.)

---

## Self-Review（计划自审，已核对）

**1. 规格覆盖：** §7 5步流程（导入/配置/当班/计算/结果）✓；§6 当班网格(Task4) ✓、结果看板(Task5) ✓；§4 建月复制目标(Task2) ✓。
**2. 占位扫描：** 无 TODO；占位文件(MonthWorkspace/各 step)在顺序上先建再替换，编译可通过。
**3. 类型一致：** `DutyGrid = Record<store, Record<date, string|string[]>>` 与后端 infer-duty 返回一致；results `{salary:[{person,commission}], breakdown:[{person,store,sales,target,achievement,bucket,commission}]}` 与后端一致；`monthsApi`/`targetsApi`/`workflowApi` 路径与后端 22 个 API 对齐。
**4. 拖拽说明：** 当班网格用「多人工单下拉选1人」（功能等价、更稳），规格里的拖拽调账作为后续增强（依赖更重的 dnd 库）。

---

## 执行交接

Plan 3b 完成后 = **完整的 Web 系统**（前端四屏 + 后端 22 API + 引擎）。可用真实6月数据全链路联调：导入→当班→计算→对账→导出。收尾建议：合并 `feat/plan1-commission-engine` 到 main、Dockerfile（前后端合一）、补长青店目标。

执行方式：沿用**子代理驱动**。
