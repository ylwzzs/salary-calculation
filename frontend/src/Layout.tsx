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
    { key: "/months", label: "月度计算" },
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
