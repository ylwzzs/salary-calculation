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
