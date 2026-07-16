import { Layout as AntLayout, Menu, Button, Avatar } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarOutlined, AppstoreOutlined, ShopOutlined, LogoutOutlined, UserOutlined,
} from "@ant-design/icons";
import { useAuth } from "./auth";

const { Header, Sider, Content } = AntLayout;

function MilkMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 2h6l1.5 4H7.5L9 2Z" fill="#fff" opacity="0.92" />
      <path d="M7.5 6h9l-1 2.2a4 4 0 0 0-.4 1.7V20a2 2 0 0 1-2 2h-2.2a2 2 0 0 1-2-2V9.9a4 4 0 0 0-.4-1.7L7.5 6Z" fill="#fff" />
      <rect x="8.5" y="12" width="7" height="3.4" rx="0.6" fill="#3B82F6" />
    </svg>
  );
}

const TITLES: Record<string, { title: string; sub: string }> = {
  "/months": { title: "月度计算", sub: "按月核算并导出提成" },
  "/products": { title: "商品档案", sub: "乳品主数据与销售成本" },
  "/stores": { title: "门店信息", sub: "门店类别、组别与目标" },
};

function titleFor(pathname: string) {
  if (pathname.startsWith("/months/")) {
    const m = pathname.split("/")[2];
    return { title: `月度工作台 · ${m}`, sub: "导入 → 配置 → 当班 → 计算 → 结果" };
  }
  return TITLES[pathname] || { title: "牛奶提成系统", sub: "" };
}

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, logout } = useAuth();
  const { title, sub } = titleFor(loc.pathname);

  const items = [
    { key: "/months", icon: <CalendarOutlined />, label: "月度计算" },
    { key: "/products", icon: <AppstoreOutlined />, label: "商品档案" },
    { key: "/stores", icon: <ShopOutlined />, label: "门店信息" },
  ];

  return (
    <AntLayout style={{ height: "100vh" }}>
      <Sider theme="dark" width={216} style={{ boxShadow: "2px 0 10px rgba(2,6,23,0.10)" }}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {/* 品牌 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#2563EB,#3B82F6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MilkMark />
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>牛奶提成</div>
              <div style={{ color: "#64748B", fontSize: 11 }}>业绩工资系统</div>
            </div>
          </div>
          {/* 导航 */}
          <div style={{ flex: 1, overflow: "auto", paddingTop: 8 }}>
            <Menu theme="dark" mode="inline" selectedKeys={[loc.pathname]} items={items}
                  onClick={({ key }) => nav(key)} style={{ borderInlineEnd: "none", background: "transparent" }} />
          </div>
          {/* 用户卡 */}
          <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
              <Avatar size={32} icon={<UserOutlined />} style={{ background: "#2563EB", flex: "0 0 32px" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{user?.username}</div>
                <div style={{ color: "#64748B", fontSize: 11 }}>管理员</div>
              </div>
              <Button type="text" size="small" icon={<LogoutOutlined />} style={{ color: "#94A3B8" }}
                      onClick={() => { logout(); nav("/login"); }} />
            </div>
          </div>
        </div>
      </Sider>

      <AntLayout>
        <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingInline: 24, background: "#fff", borderBottom: "1px solid #E2E8F0", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", lineHeight: 1.2 }}>{title}</div>
            {sub && <div style={{ fontSize: 12, color: "#94A3B8" }}>{sub}</div>}
          </div>
        </Header>
        <Content style={{ padding: 24, overflow: "auto", background: "#F8FAFC" }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
