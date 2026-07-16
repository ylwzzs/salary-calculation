import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "./index.css";
import App from "./App.tsx";

const theme = {
  token: {
    colorPrimary: "#2563EB",
    colorSuccess: "#059669",
    colorWarning: "#D97706",
    colorError: "#DC2626",
    colorBgLayout: "#F8FAFC",
    colorTextBase: "#0F172A",
    borderRadius: 8,
    fontFamily: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  components: {
    Layout: {
      siderBg: "#0F172A",
      headerBg: "#FFFFFF",
      headerHeight: 56,
      bodyBg: "#F8FAFC",
    },
    Menu: {
      darkItemBg: "#0F172A",
      darkSubMenuItemBg: "#0F172A",
      darkItemSelectedBg: "#2563EB",
      darkItemColor: "#94A3B8",
      darkItemHoverColor: "#E2E8F0",
    },
    Table: {
      headerBg: "#F1F5F9",
      headerColor: "#475569",
      rowHoverBg: "#EFF6FF",
      headerSplitColor: "transparent",
    },
    Card: { borderRadiusLG: 12, colorBorderSecondary: "#E2E8F0" },
    Steps: { colorPrimary: "#2563EB" },
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider theme={theme as any} locale={zhCN}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
