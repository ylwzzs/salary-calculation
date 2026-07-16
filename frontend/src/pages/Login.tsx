import { useState } from "react";
import { Form, Input, Button, message, Typography } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const { Title, Text } = Typography;

function MilkMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 2h6l1.5 4H7.5L9 2Z" fill="#fff" opacity="0.92" />
      <path d="M7.5 6h9l-1 2.2a4 4 0 0 0-.4 1.7V20a2 2 0 0 1-2 2h-2.2a2 2 0 0 1-2-2V9.9a4 4 0 0 0-.4-1.7L7.5 6Z" fill="#fff" />
      <rect x="8.5" y="12" width="7" height="3.4" rx="0.6" fill="#3B82F6" />
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (v: { username: string; password: string }) => {
    setBusy(true);
    try {
      await login(v.username, v.password);
      message.success("登录成功");
      nav("/months", { replace: true });
    } catch {
      message.error("账号或密码错误");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* 左：品牌面板 */}
      <div style={{
        flex: "1 1 52%", position: "relative", overflow: "hidden",
        background: "linear-gradient(150deg, #0B1220 0%, #15213B 40%, #1E3A8A 75%, #2563EB 120%)",
        display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px",
        color: "#fff",
      }}>
        {/* 装饰光斑 */}
        <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.45), transparent 70%)", top: -80, right: -80 }} />
        <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.22), transparent 70%)", bottom: -60, left: -40 }} />

        <div style={{ position: "relative", maxWidth: 420 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18,
            background: "rgba(255,255,255,0.1)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28, border: "1px solid rgba(255,255,255,0.18)" }}>
            <MilkMark size={36} />
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.15, margin: 0, letterSpacing: -0.5 }}>
            牛奶业绩<br />提成计算系统
          </h1>
          <p style={{ fontSize: 16, color: "#CBD5E1", marginTop: 18, lineHeight: 1.7, maxWidth: 360 }}>
            按门店类别 × 个人达成率 × 商品档位 自动核算每月牛奶提成，一键导出工资表。
          </p>
          <div style={{ display: "flex", gap: 28, marginTop: 36, color: "#E2E8F0", fontSize: 13 }}>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>3 维</div>提成查表</div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>逐笔</div>毛利分档</div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>版本化</div>历史留底</div>
          </div>
        </div>
      </div>

      {/* 右：登录表单 */}
      <div style={{ flex: "1 1 48%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: 32 }}>
        <div style={{ width: "100%", maxWidth: 340 }}>
          <Title level={3} style={{ marginBottom: 4, color: "#0F172A" }}>欢迎回来</Title>
          <Text type="secondary">登录以进入业绩提成看板</Text>
          <Form form={form} onFinish={onFinish} layout="vertical" size="large" style={{ marginTop: 28 }}>
            <Form.Item name="username" rules={[{ required: true, message: "请输入账号" }]}>
              <Input prefix={<UserOutlined style={{ color: "#94A3B8" }} />} placeholder="账号" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password prefix={<LockOutlined style={{ color: "#94A3B8" }} />} placeholder="密码" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={busy}
              style={{ height: 44, fontWeight: 600, marginTop: 4 }}>登录</Button>
          </Form>
          <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 12, marginTop: 16 }}>
            演示账号 <b>admin</b> / <b>admin</b>
          </div>
        </div>
      </div>
    </div>
  );
}
