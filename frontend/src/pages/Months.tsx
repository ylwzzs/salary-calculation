import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Space, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { monthsApi, type MonthInfo } from "../api";

export default function Months() {
  const nav = useNavigate();
  const [rows, setRows] = useState<MonthInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await monthsApi.list());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    const v = await form.validateFields();
    await monthsApi.create(v.month, v.copy_from || undefined);
    message.success("已建月");
    setOpen(false);
    load();
  };

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>月度计算</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setOpen(true);
          }}
        >
          新建月份
        </Button>
      </Space>
      <Table
        rowKey="month"
        loading={loading}
        dataSource={rows}
        onRow={(r) => ({
          onClick: () => nav(`/months/${r.month}`),
          style: { cursor: "pointer" },
        })}
        columns={[
          { title: "月份", dataIndex: "month" },
          {
            title: "状态",
            dataIndex: "status",
            render: (s) =>
              s === "computed" ? <Tag color="green">已计算</Tag> : <Tag>进行中</Tag>,
          },
          { title: "已导入销售", dataIndex: "sales_file", render: (v) => (v ? "是" : "否") },
          { title: "已导入让利", dataIndex: "gifts_file", render: (v) => (v ? "是" : "否") },
        ]}
      />
      <Modal
        title="新建月份"
        open={open}
        onOk={onCreate}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="month" label="月份 (YYYY-MM)" rules={[{ required: true }]}>
            <Input placeholder="如 2026-07" />
          </Form.Item>
          <Form.Item name="copy_from" label="复制上月目标 (可选)">
            <Input placeholder="如 2026-06" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
