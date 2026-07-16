import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Space, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { productsApi, type Product } from "../api";

export default function Products() {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<Product | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await productsApi.list()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onSave = async () => {
    const v = await form.validateFields();
    await productsApi.upsert({ ...editing, ...v });
    message.success("已保存");
    setOpen(false);
    load();
  };

  const openEdit = (p?: Product) => {
    setEditing(p ?? null);
    form.setFieldsValue(p ?? { category: "低温奶" });
    setOpen(true);
  };

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>商品档案</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新增/编辑</Button>
      </Space>
      <Table rowKey="barcode" loading={loading} dataSource={rows}
             columns={[
               { title: "条码", dataIndex: "barcode" },
               { title: "名称", dataIndex: "name" },
               { title: "规格", dataIndex: "spec" },
               { title: "分类", dataIndex: "category" },
               { title: "销售成本", dataIndex: "cost" },
               { title: "操作", render: (_, r) => <a onClick={() => openEdit(r)}>编辑</a> },
             ]} />
      <Modal title="商品" open={open} onOk={onSave} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="barcode" label="条码" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Form.Item name="name" label="名称"><Input /></Form.Item>
          <Form.Item name="spec" label="规格"><Input /></Form.Item>
          <Form.Item name="category" label="分类"><Input /></Form.Item>
          <Form.Item name="cost" label="销售成本"><InputNumber style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
