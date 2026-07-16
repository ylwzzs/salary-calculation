# Web 前端地基 Implementation Plan (Plan 3a / 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 搭起 React 前端：Vite 工程、Ant Design、登录鉴权、API 客户端、侧边栏布局与路由、商品/门店主数据页。这是 3b（月度工作台/当班网格/结果看板）的地基。

**Architecture:** `frontend/` 下一个 Vite + React + TypeScript 应用。`src/api.ts` 用 axios 封装后端 22 个 API（带 token 拦截器）；`AuthContext` 管登录态；React Router 做路由；Ant Design 做组件与布局。开发期直连后端 `http://localhost:8000`（后端已开 CORS）。

**Tech Stack:** Vite、React 18、TypeScript、Ant Design 5、React Router 6、axios、Vitest + @testing-library/react（测试）。

**对应规格：** §6 界面（登录、主数据管理）。

---

## File Structure

```
salary_calculation/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json / vite.config.ts
│   ├── .env.development          # VITE_API_BASE=http://localhost:8000
│   └── src/
│       ├── main.tsx
│       ├── App.tsx               # 路由 + AuthProvider
│       ├── api.ts                # axios 实例 + 全部端点封装
│       ├── auth.tsx              # AuthContext + useAuth + ProtectedRoute
│       ├── Layout.tsx            # 侧边栏 + 顶栏 + Outlet
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Products.tsx
│       │   └── Stores.tsx
│       └── __tests__/            # vitest
│           ├── api.test.ts
│           └── Login.test.tsx
```

`api.ts` 单一职责：HTTP 封装；`auth.tsx`：登录态；每个 page 一个屏幕；`Layout.tsx`：外壳。

---

## Task 1: Vite 工程骨架

**Files:** 用 `npm create vite` 生成，再调整。

- [ ] **Step 1: 生成 Vite React TS 工程（非交互）**

Run:
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
npm install antd @ant-design/icons react-router-dom axios
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event
```

- [ ] **Step 2: `frontend/.gitignore` 已由模板生成（含 node_modules/dist）。在仓库根 `.gitignore` 确认或追加：**

```
node_modules/
dist/
frontend/node_modules/
frontend/dist/
```

- [ ] **Step 3: 建 `frontend/.env.development`**

```
VITE_API_BASE=http://localhost:8000
```

- [ ] **Step 4: `frontend/vite.config.ts`（覆盖模板，加 vitest 与 dev server 端口）**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 5: 建 `frontend/src/test-setup.ts`**

```typescript
import "@testing-library/jest-dom";
```

- [ ] **Step 6: 替换 `frontend/src/App.tsx` 为最小可编译骨架（后续任务扩展）**

```typescript
function App() {
  return <div style={{ padding: 24 }}>牛奶提成系统</div>;
}
export default App;
```

- [ ] **Step 7: 写冒烟测试 `frontend/src/__tests__/app.test.tsx`**

```typescript
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders title", () => {
  render(<App />);
  expect(screen.getByText("牛奶提成系统")).toBeInTheDocument();
});
```

- [ ] **Step 8: 跑测试 + 构建**

Run: `cd frontend && npx vitest run && npm run build`
Expected: 测试 1 passed；build 成功（dist 生成）。

- [ ] **Step 9: 提交**

```bash
git add frontend .gitignore
git commit -m "feat(frontend): Vite+React+TS+AntD 工程骨架"
```

---

## Task 2: API 客户端（axios + token 拦截器）

**Files:**
- Create: `frontend/src/api.ts`
- Test: `frontend/src/__tests__/api.test.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/__tests__/api.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";

describe("api client", () => {
  afterEach(() => localStorage.clear());

  it("login stores token via setToken", () => {
    api.setToken("abc");
    expect(api.getToken()).toBe("abc");
  });

  it("getToken returns null when absent", () => {
    expect(api.getToken()).toBeNull();
  });

  it("clearToken removes it", () => {
    api.setToken("abc");
    api.clearToken();
    expect(api.getToken()).toBeNull();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `cd frontend && npx vitest run src/__tests__/api.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现 `frontend/src/api.ts`**

```typescript
import axios from "axios";

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8000",
});

const TOKEN_KEY = "salary_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// 请求拦截器：带 token
http.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// 响应拦截器：401 清 token（交由路由层跳登录）
http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) clearToken();
    return Promise.reject(err);
  },
);

// —— 端点封装 ——
export const authApi = {
  login: (username: string, password: string) =>
    http.post<{ token: string }>("/auth/login", { username, password }).then((r) => r.data),
  me: () => http.get<{ username: string }>("/auth/me").then((r) => r.data),
};

export interface Product {
  barcode: string;
  name?: string;
  spec?: string;
  category?: string;
  cost?: number | null;
}

export const productsApi = {
  list: () => http.get<Product[]>("/products").then((r) => r.data),
  upsert: (p: Product) => http.put<Product>(`/products/${p.barcode}`, p).then((r) => r.data),
};

export interface Store {
  name: string;
  group?: string;
  store_class?: string;
  supervisor?: string;
}

export const storesApi = {
  list: () => http.get<Store[]>("/stores").then((r) => r.data),
  upsert: (s: Store) => http.put<Store>(`/stores/${s.name}`, s).then((r) => r.data),
  batchClass: (group: string, store_class: string) =>
    http.post<{ updated: number }>("/stores/batch-class", { group, store_class }).then((r) => r.data),
};
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run src/__tests__/api.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/api.ts frontend/src/__tests__/api.test.ts
git commit -m "feat(frontend): API 客户端（axios + token 拦截器）"
```

---

## Task 3: 登录鉴权（AuthContext + Login 页 + ProtectedRoute）

**Files:**
- Create: `frontend/src/auth.tsx`, `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/App.tsx`（接 AuthProvider + 路由）
- Test: `frontend/src/__tests__/Login.test.tsx`

- [ ] **Step 1: 写失败测试 `frontend/src/__tests__/Login.test.tsx`**

```typescript
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "../auth";
import Login from "../pages/Login";

afterEach(() => localStorage.clear());

function Probe() {
  const { user } = useAuth();
  return <div data-testid="probe">{user ? `ok:${user.username}` : "no"}</div>;
}

describe("Login", () => {
  it("logs in and sets user", async () => {
    vi.mock("../api", async () => {
      const actual = await vi.importActual<typeof import("../api")>("../api");
      return {
        ...actual,
        authApi: { login: vi.fn(async () => ({ token: "T" })), me: vi.fn(async () => ({ username: "admin" })) },
      };
    });
    render(
      <AuthProvider>
        <Login />
        <Probe />
      </AuthProvider>,
    );
    await userEvent.type(screen.getByPlaceholderText("账号"), "admin");
    await userEvent.type(screen.getByPlaceholderText("密码"), "admin");
    await userEvent.click(screen.getByText("登录"));
    expect(await screen.findByText("ok:admin")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/__tests__/Login.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写 `frontend/src/auth.tsx`**

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi, getToken, setToken, clearToken } from "./api";

interface AuthState {
  user: { username: string } | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getToken()) {
      authApi.me().then(setUser).catch(() => clearToken()).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const { token } = await authApi.login(username, password);
    setToken(token);
    const me = await authApi.me();
    setUser(me);
  };
  const logout = () => {
    clearToken();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: 写 `frontend/src/pages/Login.tsx`**

```typescript
import { useState } from "react";
import { Card, Form, Input, Button, message } from "antd";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (v: { username: string; password: string }) => {
    setBusy(true);
    try {
      await login(v.username, v.password);
      message.success("登录成功");
    } catch {
      message.error("账号或密码错误");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
      <Card title="牛奶提成系统" style={{ width: 360 }}>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="username" rules={[{ required: true }]}>
            <Input placeholder="账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>登录</Button>
        </Form>
        <div style={{ color: "#999", fontSize: 12, marginTop: 8 }}>默认 admin / admin</div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: 替换 `frontend/src/App.tsx`（AuthProvider + 登录/主壳切换）**

```typescript
import { Spin } from "antd";
import { AuthProvider, useAuth } from "./auth";
import Login from "./pages/Login";

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <Spin style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />;
  if (!user) return <Login />;
  return <div style={{ padding: 24 }}>已登录，主壳在 Task 4 接入（{user.username}）</div>;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
```

- [ ] **Step 6: 运行验证通过**

Run: `npx vitest run src/__tests__/Login.test.tsx && npm run build`
Expected: 测试 PASS；build 成功。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/auth.tsx frontend/src/pages frontend/src/App.tsx frontend/src/__tests__/Login.test.tsx
git commit -m "feat(frontend): 登录鉴权（AuthContext + Login 页）"
```

---

## Task 4: 侧边栏布局与路由骨架

**Files:**
- Create: `frontend/src/Layout.tsx`, `frontend/src/pages/Placeholder.tsx`
- Modify: `frontend/src/App.tsx`（接路由）

- [ ] **Step 1: 写 `frontend/src/pages/Placeholder.tsx`**

```typescript
export default function Placeholder({ title }: { title: string }) {
  return <h2>{title}</h2>;
}
```

- [ ] **Step 2: 写 `frontend/src/Layout.tsx`**

```typescript
import { Layout as AntLayout, Menu, Button, theme } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

const { Header, Sider, Content } = AntLayout;

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, logout } = useAuth();
  const { token: t } = theme.useToken();

  const items = [
    { key: "/products", label: "商品档案" },
    { key: "/stores", label: "门店信息" },
  ];

  return (
    <AntLayout style={{ height: "100vh" }}>
      <Sider theme="dark">
        <div style={{ color: "#fff", padding: 16, fontWeight: 600 }}>🥛 牛奶提成</div>
        <Menu theme="dark" mode="inline" selectedKeys={[loc.pathname]} items={items}
              onClick={({ key }) => nav(key)} />
      </Sider>
      <AntLayout>
        <Header style={{ background: t.colorBgContainer, display: "flex", justifyContent: "flex-end", alignItems: "center", paddingInline: 16 }}>
          <span style={{ marginRight: 12 }}>{user?.username}</span>
          <Button onClick={() => { logout(); nav("/login"); }}>退出</Button>
        </Header>
        <Content style={{ padding: 24, overflow: "auto", background: "#f0f2f5" }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
```

- [ ] **Step 3: 替换 `frontend/src/App.tsx`（BrowserRouter + 路由）**

```typescript
import { Spin } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Login from "./pages/Login";
import Layout from "./Layout";
import Products from "./pages/Products";
import Stores from "./pages/Stores";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Spin style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/products" element={<Products />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/" element={<Navigate to="/products" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

> 注：`Products`/`Stores` 在 Task 5/6 实现；本任务先建同名占位文件以便编译通过。

- [ ] **Step 4: 建 `frontend/src/pages/Products.tsx` 和 `Stores.tsx` 占位（Task 5/6 替换）**

```typescript
// Products.tsx / Stores.tsx（占位）
export default function Products() { return <h2>商品档案</h2>; }
```

- [ ] **Step 5: 构建 + 已有测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build 成功；测试仍 PASS。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/Layout.tsx frontend/src/pages frontend/src/App.tsx
git commit -m "feat(frontend): 侧边栏布局与路由骨架"
```

---

## Task 5: 商品档案页

**Files:**
- Modify: `frontend/src/pages/Products.tsx`（替换占位）

- [ ] **Step 1: 实现 `frontend/src/pages/Products.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Space, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { productsApi, type Product } from "../api";

export default function Products() {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<Product | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await productsApi.list()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onSave = async () => {
    const v = await form.validateFields();
    await productsApi.upsert({ ...editing, ...v });
    message.success("已保存");
    setOpen(false);
    load();
  };

  const openEdit = (p?: Product) => {
    setEditing(p ?? null);
    form.setFieldsValue(p ?? { category: "低温奶" });
    setOpen(true);
  };

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>商品档案</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新增/编辑</Button>
      </Space>
      <Table rowKey="barcode" loading={loading} dataSource={rows}
             columns={[
               { title: "条码", dataIndex: "barcode" },
               { title: "名称", dataIndex: "name" },
               { title: "规格", dataIndex: "spec" },
               { title: "分类", dataIndex: "category" },
               { title: "销售成本", dataIndex: "cost" },
               { title: "操作", render: (_, r) => <a onClick={() => openEdit(r)}>编辑</a> },
             ]} />
      <Modal title="商品" open={open} onOk={onSave} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="barcode" label="条码" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Form.Item name="name" label="名称"><Input /></Form.Item>
          <Form.Item name="spec" label="规格"><Input /></Form.Item>
          <Form.Item name="category" label="分类"><Input /></Form.Item>
          <Form.Item name="cost" label="销售成本"><InputNumber style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: 构建 + 测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build 成功；测试 PASS。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/Products.tsx
git commit -m "feat(frontend): 商品档案页（表格+编辑）"
```

---

## Task 6: 门店信息页（含按组批量改类别）

**Files:**
- Modify: `frontend/src/pages/Stores.tsx`（替换占位）

- [ ] **Step 1: 实现 `frontend/src/pages/Stores.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Space, message, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { storesApi, type Store } from "../api";

const CLASSES = ["A", "B", "C", "D"];

export default function Stores() {
  const [rows, setRows] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<Store | null>(null);
  const [batchGroup, setBatchGroup] = useState<string>("");
  const [batchClass, setBatchClass] = useState<string>("A");

  const load = async () => {
    setLoading(true);
    try { setRows(await storesApi.list()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onSave = async () => {
    const v = await form.validateFields();
    await storesApi.upsert({ ...editing, ...v });
    message.success("已保存"); setOpen(false); load();
  };
  const openEdit = (s?: Store) => {
    setEditing(s ?? null); form.setFieldsValue(s ?? {}); setOpen(true);
  };
  const onBatch = async () => {
    if (!batchGroup) { message.warning("请输入组别"); return; }
    const { updated } = await storesApi.batchClass(batchGroup, batchClass);
    message.success(`已更新 ${updated} 家`); load();
  };

  return (
    <>
      <Space style={{ marginBottom: 12 } as any} align="end">
        <h2 style={{ margin: 0 }}>门店信息</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新增/编辑</Button>
      </Space>
      <Space style={{ marginBottom: 12, display: "flex" }}>
        <Input placeholder="组别(如 1组)" value={batchGroup} onChange={(e) => setBatchGroup(e.target.value)} style={{ width: 140 }} />
        <Select value={batchClass} onChange={setBatchClass} style={{ width: 90 }} options={CLASSES.map((c) => ({ value: c, label: c + "类" }))} />
        <Button onClick={onBatch}>按组批量改类别</Button>
      </Space>
      <Table rowKey="name" loading={loading} dataSource={rows}
             columns={[
               { title: "门店", dataIndex: "name" },
               { title: "组别", dataIndex: "group" },
               { title: "类别", dataIndex: "store_class" },
               { title: "主管", dataIndex: "supervisor" },
               { title: "操作", render: (_, r) => <a onClick={() => openEdit(r)}>编辑</a> },
             ]} />
      <Modal title="门店" open={open} onOk={onSave} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="门店名称" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Form.Item name="group" label="组别"><Input placeholder="如 1组" /></Form.Item>
          <Form.Item name="store_class" label="类别"><Select options={CLASSES.map((c) => ({ value: c, label: c }))} /></Form.Item>
          <Form.Item name="supervisor" label="主管"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: 构建 + 全部测试**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build 成功；所有前端测试 PASS。

- [ ] **Step 3: 手动联调（可选，需后端在跑）**

后端 `uvicorn backend.app.main:app`，前端 `npm run dev`，登录 admin/admin，看商品/门店列表。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/pages/Stores.tsx
git commit -m "feat(frontend): 门店信息页（含按组批量改类别）"
```

---

## Self-Review（计划自审，已核对）

**1. 规格覆盖：** §6 登录页(Task3) ✓、主数据管理-商品/门店(Task5/6) ✓、按组批量改类别(Task6) ✓；侧边栏布局(Task4) ✓。月度工作台/当班网格/结果看板属 3b。
**2. 占位扫描：** 无 TODO；每任务有构建/测试验证步骤。Task4 的 Products/Stores 占位在 Task5/6 替换——顺序已排好（Task4 先建占位以编译，Task5/6 替换）。
**3. 类型一致：** `api.ts` 的 `Product`/`Store` interface 与后端 schema 字段(barcode/name/spec/category/cost；name/group/store_class/supervisor)一致；`authApi`/`productsApi`/`storesApi` 路径与后端一致(/auth/login,/auth/me,/products,/stores,/stores/batch-class)。
**4. 前端测试策略（TDD 适配）：** 纯逻辑(api token、login 流)用 Vitest 断言；组件用 `npm run build`(tsc+vite)作类型/编译门 + 关键交互(Login)用 Testing Library。每任务都有 build 通过的验证。

---

## 执行交接

Plan 3a 完成后，得到**可登录、可管理主数据**的前端（`cd frontend && npm run dev`），与后端联调通。之后：
- **Plan 3b · 月度工作台 UI**：月度列表、5步工作台、当班网格(多人工单下拉确认)、结果看板(工资表+明细+导出)。

执行方式：沿用**子代理驱动**。
