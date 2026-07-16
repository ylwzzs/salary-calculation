import { type ReactNode } from "react";
import { Spin } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Login from "./pages/Login";
import Layout from "./Layout";
import Products from "./pages/Products";
import Stores from "./pages/Stores";
import Months from "./pages/Months";
import MonthWorkspace from "./pages/MonthWorkspace";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spin style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// 已登录则离开登录页
function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spin style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />;
  if (user) return <Navigate to="/months" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/months" element={<Months />} />
            <Route path="/months/:month" element={<MonthWorkspace />} />
            <Route path="/products" element={<Products />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/" element={<Navigate to="/months" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
