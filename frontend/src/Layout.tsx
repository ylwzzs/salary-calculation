import { Layout as AntLayout, Menu, Button, Avatar, Space, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarOutlined, AppstoreOutlined, ShopOutlined, LogoutOutlined, UserOutlined,
} from "@ant-design/icons";
import { useAuth } from "./auth";

const { Header, Sider, Content } = AntLayout;
const { Text } = Typography;

/** 牛奶瓶 SVG 图标（替代 emoji） */
function MilkLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 2h6l1.5 4H7.5L9 2Z" fill="#fff" opacity="0.9" />
      <path d="M7.5 6h9l-1 2.2a4 4 0 0 0-.4 1.7V20a2 2 0 0 1-2 2h-2.2a2 2 0 0 1-2-2V9.9a4 4 0 0 0-.4-1.7L7.5 6Z"
            fill="#fff" opacity="0.95" />
      <rect x="8.5" y="12" width="7" height="3.4" rx="0.6" fill="#2563EB" />
    </svg>
  );
}

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, logout } = useAuth();

  const items = [
    { key: "/months", icon: <CalendarOutlined />, label: "月度计算" },
    { key: "/products", icon: <AppstoreOutlined />, label: "商品档案" },
    { key: "/stores", icon: <ShopOutlined />, label: "门店信息" },
  ];

  return (
    <AntLayout style={{ height: "100vh" }}>
      <Sider theme="dark" width={208} style={{ boxShadow: "2px 0 8px rgba(15,23,42,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#2563EB,#3B82F6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MilkLogo />
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 15, lineHeight: 1.1 }}>牛奶提成</div>
            <div style={{ color: "#64748B", fontSize: 11 }}>业绩工资系统</div>
          </div>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[loc.pathname]} items={items}
              onClick={({ key }) => nav(key)} style={{ borderInlineEnd: "none", marginTop: 8 }} />
      </Sider>
      <AntLayout>
        <Header style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", paddingInline: 20, borderBottom: "1px solid #E2E8F0", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
          <Space size={12}>
            <Avatar size={30} icon={<UserOutlined />} style={{ background: "#2563EB" }} />
            <Text strong style={{ color: "#0F172A" }}>{user?.username}</Text>
            <Button type="text" danger icon={<LogoutOutlined />} onClick={() => { logout(); nav("/login"); }}>退出</Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, overflow: "auto", background: "#F8FAFC" }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
