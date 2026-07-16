import { useState } from "react";
import { Card, Form, Input, Button, message, Typography } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const { Title, Text } = Typography;

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
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0F172A 0%, #1E293B 45%, #2563EB 140%)",
    }}>
      <Card style={{ width: 380, borderRadius: 16, boxShadow: "0 20px 50px rgba(2,6,23,0.35)", border: "none" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, margin: "0 auto 12px", borderRadius: 14,
            background: "linear-gradient(135deg,#2563EB,#3B82F6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 2h6l1.5 4H7.5L9 2Z" fill="#fff" opacity="0.9" />
              <path d="M7.5 6h9l-1 2.2a4 4 0 0 0-.4 1.7V20a2 2 0 0 1-2 2h-2.2a2 2 0 0 1-2-2V9.9a4 4 0 0 0-.4-1.7L7.5 6Z" fill="#fff" />
              <rect x="8.5" y="12" width="7" height="3.4" rx="0.6" fill="#2563EB" />
            </svg>
          </div>
          <Title level={4} style={{ margin: 0, color: "#0F172A" }}>牛奶业绩提成系统</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>请登录以继续</Text>
        </div>
        <Form form={form} onFinish={onFinish} layout="vertical" size="large">
          <Form.Item name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input prefix={<UserOutlined />} placeholder="账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy} style={{ height: 42 }}>登录</Button>
        </Form>
        <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 12, marginTop: 12 }}>默认账号 admin / admin</div>
      </Card>
    </div>
  );
}
