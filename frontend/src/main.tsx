import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "./index.css";
import App from "./App.tsx";

// Notion 风格主题：暖中性、扁平、浅色侧栏、克制蓝
const theme = {
  token: {
    colorPrimary: "#2383E2",
    colorLink: "#2383E2",
    colorBgLayout: "#F7F7F5",
    colorBgContainer: "#FFFFFF",
    colorTextBase: "#37352F",
    colorBorder: "#E9E9E7",
    colorBorderSecondary: "#EFEFED",
    borderRadius: 6,
    wireframe: false,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Layout: {
      siderBg: "#F7F7F5",
      headerBg: "#FFFFFF",
      bodyBg: "#F7F7F5",
      headerHeight: 52,
      headerPadding: "0 24px",
    },
    Menu: {
      itemBg: "transparent",
      subMenuItemBg: "transparent",
      itemColor: "#787774",
      itemHoverColor: "#37352F",
      itemHoverBg: "rgba(55,53,47,0.06)",
      itemSelectedColor: "#37352F",
      itemSelectedBg: "rgba(55,53,47,0.085)",
      itemActiveBg: "rgba(55,53,47,0.06)",
      activeBarHeight: 0,
      iconSize: 16,
    },
    Table: {
      headerBg: "#FAFAF9",
      headerColor: "#787774",
      rowHoverBg: "rgba(55,53,47,0.035)",
      borderColor: "#E9E9E7",
      headerSplitColor: "transparent",
      cellPaddingBlock: 11,
    },
    Card: { colorBorderSecondary: "#E9E9E7", borderRadiusLG: 8, paddingLG: 16 },
    Button: { controlHeight: 34, paddingInline: 14 },
    Input: { colorBorder: "#E9E9E7", activeShadow: "0 0 0 2px rgba(35,131,226,0.15)" },
    Steps: { colorPrimary: "#2383E2" },
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider theme={theme as any} locale={zhCN}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
