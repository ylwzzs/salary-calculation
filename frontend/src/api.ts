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

// 响应拦截器：401 清 token
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
  exclude_commission?: boolean;
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
    return http.post(`/months/${month}/import-gifts`, fd).then((r) => r.data);
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
