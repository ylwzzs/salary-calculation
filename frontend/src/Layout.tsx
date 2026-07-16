import { Layout as AntLayout, Menu, Button, Avatar } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarOutlined, AppstoreOutlined, ShopOutlined, LogoutOutlined, UserOutlined,
} from "@ant-design/icons";
import { useAuth } from "./auth";

const { Header, Sider, Content } = AntLayout;

function MilkMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 2h6l1.5 4H7.5L9 2Z" fill="#fff" opacity="0.95" />
      <path d="M7.5 6h9l-1 2.2a4 4 0 0 0-.4 1.7V20a2 2 0 0 1-2 2h-2.2a2 2 0 0 1-2-2V9.9a4 4 0 0 0-.4-1.7L7.5 6Z" fill="#fff" />
      <rect x="8.5" y="12" width="7" height="3.4" rx="0.6" fill="#37352F" />
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
      <Sider width={232} style={{ background: "#F7F7F5", borderRight: "1px solid #E9E9E7" }}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {/* 品牌（Notion 工作区风格） */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 14px" }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "#37352F", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MilkMark />
            </div>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ color: "#37352F", fontWeight: 600, fontSize: 14 }}>牛奶业绩提成</div>
              <div style={{ color: "#9B9A97", fontSize: 12 }}>workspace</div>
            </div>
          </div>
          {/* 导航 */}
          <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
            <Menu mode="inline" selectedKeys={[loc.pathname]} items={items}
                  onClick={({ key }) => nav(key)} style={{ background: "transparent", borderInlineEnd: "none" }} />
          </div>
          {/* 用户卡 */}
          <div style={{ padding: 10, borderTop: "1px solid #EFEFED" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 6, cursor: "default" }}
                 className="notion-user">
              <Avatar size={26} icon={<UserOutlined />} style={{ background: "#EBEBEA", color: "#787774", flex: "0 0 26px" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#37352F", fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>{user?.username}</div>
                <div style={{ color: "#9B9A97", fontSize: 11 }}>管理员</div>
              </div>
              <Button type="text" size="small" icon={<LogoutOutlined />} style={{ color: "#9B9A97" }}
                      onClick={() => { logout(); nav("/login"); }} />
            </div>
          </div>
        </div>
      </Sider>

      <AntLayout>
        <Header style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #E9E9E7" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#37352F", lineHeight: 1.2 }}>{title}</div>
            {sub && <div style={{ fontSize: 12.5, color: "#9B9A97" }}>{sub}</div>}
          </div>
        </Header>
        <Content style={{ padding: 28, overflow: "auto", background: "#F7F7F5" }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
