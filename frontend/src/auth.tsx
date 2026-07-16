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
