import { useEffect, useState, type ReactNode } from "react";
import { Button, Table, message, Drawer, Space, Card, Col, Row, Typography, Tag } from "antd";
import { DownloadOutlined, ThunderboltOutlined, TeamOutlined, DollarOutlined } from "@ant-design/icons";
import { workflowApi } from "../../api";

const { Text } = Typography;

interface ResultData {
  salary: { person: string; commission: number }[];
  breakdown: {
    person: string; store: string; sales: number; target: number;
    achievement: number; bucket: string; commission: number;
  }[];
}

const BUCKET_COLOR: Record<string, string> = {
  GE_100: "green", "90_100": "blue", "80_90": "cyan", "70_80": "gold", LT_70: "default",
};

function Kpi({ icon, title, value, accent }: { icon: ReactNode; title: string; value: string; accent: string }) {
  return (
    <Card size="small" style={{ borderRadius: 10 }} styles={{ body: { padding: 16 } }}>
      <Space align="center" size={14}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: accent + "1A", color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
        <div>
          <div style={{ color: "#64748B", fontSize: 12 }}>{title}</div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 600, color: "#0F172A", lineHeight: 1.2 }}>{value}</div>
        </div>
      </Space>
    </Card>
  );
}

export default function ResultsStep({ month, onComputed }: { month: string; onComputed?: () => void }) {
  const [data, setData] = useState<ResultData | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try { setData(await workflowApi.getResults(month)); } catch { setData(null); }
  };
  useEffect(() => { load(); }, []);

  const compute = async () => {
    setBusy(true);
    try {
      const r = await workflowApi.compute(month);
      message.success(`计算完成：${r.details} 条明细，总额 ¥${r.total.toFixed(2)}`);
      onComputed?.();
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string });
      message.error("计算失败：" + (msg.response?.data?.detail || msg.message || "未知错误"));
    } finally { setBusy(false); }
  };

  const total = data ? data.salary.reduce((s, x) => s + x.commission, 0) : 0;
  const has = !!data && data.salary.length > 0;
  const avg = has ? total / data!.salary.length : 0;

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={busy} onClick={compute}>计算提成</Button>
        <Button icon={<DownloadOutlined />} onClick={() => workflowApi.downloadExport(month)}>导出 Excel</Button>
      </Space>

      {has && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={8}><Kpi icon={<DollarOutlined />} title="提成总额" value={"¥" + total.toFixed(2)} accent="#2563EB" /></Col>
          <Col span={8}><Kpi icon={<TeamOutlined />} title="参与营业员" value={String(data!.salary.length)} accent="#059669" /></Col>
          <Col span={8}><Kpi icon={<DollarOutlined />} title="人均提成" value={"¥" + avg.toFixed(2)} accent="#7C3AED" /></Col>
        </Row>
      )}

      <Card size="small" style={{ borderRadius: 10 }} styles={{ body: { padding: 0 } }}>
        <Table rowKey="person" size="middle"
               dataSource={data?.salary || []}
               onRow={() => ({ onClick: () => setOpen(true), style: { cursor: "pointer" } })}
               locale={{ emptyText: "尚未计算" }}
               pagination={{ pageSize: 15, showSizeChanger: false }}
               columns={[
                 { title: "营业员", dataIndex: "person", render: (v) => <Text strong>{v}</Text> },
                 { title: "提成合计", dataIndex: "commission", align: "right", width: 140,
                   render: (v: number) => <span className="tnum" style={{ color: "#2563EB", fontWeight: 600 }}>¥{v.toFixed(2)}</span> },
               ]} />
      </Card>
      <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: "block" }}>点击任意行查看该人「人×店」明细</Text>

      <Drawer title={<Space><TeamOutlined /> 提成明细（人×店）</Space>} open={open} onClose={() => setOpen(false)} width={780}>
        <Table rowKey={(r) => r.person + r.store} size="small"
               dataSource={data?.breakdown || []} pagination={{ pageSize: 50 }}
               columns={[
                 { title: "营业员", dataIndex: "person" },
                 { title: "门店", dataIndex: "store" },
                 { title: "业绩", dataIndex: "sales", align: "right", render: (v: number) => <span className="tnum">{v?.toFixed(0)}</span> },
                 { title: "目标", dataIndex: "target", align: "right", render: (v: number) => <span className="tnum">{v?.toFixed(0)}</span> },
                 { title: "达成", dataIndex: "achievement", align: "right", render: (v: number) => <span className="tnum">{(v * 100).toFixed(0)}%</span> },
                 { title: "档", dataIndex: "bucket", align: "center", render: (b: string) => <Tag color={BUCKET_COLOR[b] || "default"}>{b}</Tag> },
                 { title: "提成", dataIndex: "commission", align: "right", render: (v: number) => <span className="tnum" style={{ fontWeight: 600 }}>¥{v.toFixed(2)}</span> },
               ]} />
      </Drawer>
    </>
  );
}
