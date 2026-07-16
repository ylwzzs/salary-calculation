import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Space, message, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { storesApi, type Store } from "../api";

const CLASSES = ["A", "B", "C", "D"];

export default function Stores() {
  const [rows, setRows] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<Store | null>(null);
  const [batchGroup, setBatchGroup] = useState<string>("");
  const [batchClass, setBatchClass] = useState<string>("A");

  const load = async () => {
    setLoading(true);
    try { setRows(await storesApi.list()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onSave = async () => {
    const v = await form.validateFields();
    await storesApi.upsert({ ...editing, ...v });
    message.success("已保存"); setOpen(false); load();
  };
  const openEdit = (s?: Store) => {
    setEditing(s ?? null); form.setFieldsValue(s ?? {}); setOpen(true);
  };
  const onBatch = async () => {
    if (!batchGroup) { message.warning("请输入组别"); return; }
    const { updated } = await storesApi.batchClass(batchGroup, batchClass);
    message.success(`已更新 ${updated} 家`); load();
  };

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>门店信息</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新增/编辑</Button>
      </Space>
      <Space style={{ marginBottom: 12, display: "flex" }}>
        <Input placeholder="组别(如 1组)" value={batchGroup} onChange={(e) => setBatchGroup(e.target.value)} style={{ width: 140 }} />
        <Select value={batchClass} onChange={setBatchClass} style={{ width: 90 }} options={CLASSES.map((c) => ({ value: c, label: c + "类" }))} />
        <Button onClick={onBatch}>按组批量改类别</Button>
      </Space>
      <Table rowKey="name" loading={loading} dataSource={rows}
             columns={[
               { title: "门店", dataIndex: "name" },
               { title: "组别", dataIndex: "group" },
               { title: "类别", dataIndex: "store_class" },
               { title: "主管", dataIndex: "supervisor" },
               { title: "操作", render: (_, r) => <a onClick={() => openEdit(r)}>编辑</a> },
             ]} />
      <Modal title="门店" open={open} onOk={onSave} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="门店名称" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Form.Item name="group" label="组别"><Input placeholder="如 1组" /></Form.Item>
          <Form.Item name="store_class" label="类别"><Select options={CLASSES.map((c) => ({ value: c, label: c }))} /></Form.Item>
          <Form.Item name="supervisor" label="主管"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
