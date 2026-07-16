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
