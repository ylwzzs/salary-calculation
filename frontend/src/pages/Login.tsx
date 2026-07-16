import { useState } from "react";
import { Form, Input, Button, message } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F7F5" }}>
      <div style={{ width: 320, textAlign: "center" }}>
        {/* Logo */}
        <div style={{ width: 46, height: 46, margin: "0 auto 18px", borderRadius: 10, background: "#37352F",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 2h6l1.5 4H7.5L9 2Z" fill="#fff" opacity="0.95" />
            <path d="M7.5 6h9l-1 2.2a4 4 0 0 0-.4 1.7V20a2 2 0 0 1-2 2h-2.2a2 2 0 0 1-2-2V9.9a4 4 0 0 0-.4-1.7L7.5 6Z" fill="#fff" />
            <rect x="8.5" y="12" width="7" height="3.4" rx="0.6" fill="#37352F" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", margin: "0 0 4px" }}>登录到 牛奶业绩提成</h1>
        <p style={{ color: "#9B9A97", fontSize: 14, margin: "0 0 28px" }}>使用账号密码继续</p>

        <Form form={form} onFinish={onFinish} layout="vertical" style={{ textAlign: "left" }}>
          <Form.Item name="username" rules={[{ required: true, message: "请输入账号" }]} style={{ marginBottom: 12 }}>
            <Input size="large" prefix={<UserOutlined style={{ color: "#9B9A97" }} />} placeholder="账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]} style={{ marginBottom: 18 }}>
            <Input.Password size="large" prefix={<LockOutlined style={{ color: "#9B9A97" }} />} placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={busy}
                  style={{ fontWeight: 600 }}>继续</Button>
        </Form>

        <div style={{ marginTop: 22, color: "#9B9A97", fontSize: 12.5 }}>
          演示账号 <span style={{ color: "#37352F", fontWeight: 600 }}>admin</span> / <span style={{ color: "#37352F", fontWeight: 600 }}>admin</span>
        </div>
      </div>
    </div>
  );
}
