import { useState } from "react";
import { Card, Form, Input, Button, message } from "antd";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (v: { username: string; password: string }) => {
    setBusy(true);
    try {
      await login(v.username, v.password);
      message.success("登录成功");
    } catch {
      message.error("账号或密码错误");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
      <Card title="牛奶提成系统" style={{ width: 360 }}>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="username" rules={[{ required: true }]}>
            <Input placeholder="账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>登录</Button>
        </Form>
        <div style={{ color: "#999", fontSize: 12, marginTop: 8 }}>默认 admin / admin</div>
      </Card>
    </div>
  );
}
