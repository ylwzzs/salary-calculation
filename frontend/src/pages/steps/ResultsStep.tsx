import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Table, message, Drawer, Space, Card, Col, Row, Typography, Tag, Empty } from "antd";
import { DownloadOutlined, ThunderboltOutlined, TeamOutlined, DollarOutlined, BarChartOutlined } from "@ant-design/icons";
import { workflowApi } from "../../api";

const { Text } = Typography;

interface Breakdown {
  person: string; store: string; sales: number; target: number;
  achievement: number; bucket: string; commission: number;
}
interface ResultData { salary: { person: string; commission: number }[]; breakdown: Breakdown[]; }

// Notion 风柔和配色
const BUCKETS = [
  { key: "GE_100", label: "≥100%", color: "#0F7B6C" },
  { key: "90_100", label: "90~99%", color: "#2383E2" },
  { key: "80_90", label: "80~89%", color: "#6F5BD0" },
  { key: "70_80", label: "70~79%", color: "#CB7623" },
  { key: "LT_70", label: "<70%", color: "#9B9A97" },
];
const BUCKET_COLOR: Record<string, string> = Object.fromEntries(BUCKETS.map((b) => [b.key, b.color]));
const MEDAL = ["#C99700", "#91918E", "#A35E2C"]; // 金 银 铜（柔和）

function Kpi({ icon, title, value, accent }: { icon: ReactNode; title: string; value: string; accent: string }) {
  return (
    <Card size="small" style={{ borderRadius: 8, borderColor: "#E9E9E7" }} styles={{ body: { padding: 16 } }}>
      <Space align="center" size={14}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: accent + "18", color: accent,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{icon}</div>
        <div>
          <div style={{ color: "#9B9A97", fontSize: 12.5 }}>{title}</div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: "#37352F", lineHeight: 1.2 }}>{value}</div>
        </div>
      </Space>
    </Card>
  );
}

function BucketChart({ rows }: { rows: Breakdown[] }) {
  const counts = BUCKETS.map((b) => ({ ...b, n: rows.filter((r) => r.bucket === b.key).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  const total = counts.reduce((s, c) => s + c.n, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      {counts.map((c) => (
        <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 64, fontSize: 12.5, color: "#787774" }}>{c.label}</div>
          <div style={{ flex: 1, height: 16, background: "#F1F1EF", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ width: `${(c.n / max) * 100}%`, height: "100%", background: c.color, borderRadius: 8, transition: "width .4s" }} />
          </div>
          <div className="tnum" style={{ width: 36, textAlign: "right", fontSize: 13, fontWeight: 600, color: "#37352F" }}>{c.n}</div>
          <div style={{ width: 38, textAlign: "right", fontSize: 11.5, color: "#9B9A97" }}>{total ? Math.round((c.n / total) * 100) : 0}%</div>
        </div>
      ))}
    </div>
  );
}

export default function ResultsStep({ month, onComputed }: { month: string; onComputed?: () => void }) {
  const [data, setData] = useState<ResultData | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<string | null>(null);

  const load = async () => { try { setData(await workflowApi.getResults(month)); } catch { setData(null); } };
  useEffect(() => { load(); }, []);

  const compute = async () => {
    setBusy(true);
    try {
      const r = await workflowApi.compute(month);
      message.success(`计算完成：${r.details} 条明细，总额 ¥${r.total.toFixed(2)}`);
      onComputed?.(); await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string });
      message.error("计算失败：" + (msg.response?.data?.detail || msg.message || "未知错误"));
    } finally { setBusy(false); }
  };

  const total = data ? data.salary.reduce((s, x) => s + x.commission, 0) : 0;
  const has = !!data && data.salary.length > 0;
  const avg = has ? total / data!.salary.length : 0;
  const top5 = useMemo(() => (data?.salary || []).slice(0, 5), [data]);
  const personDetail = useMemo(() => (data?.breakdown || []).filter((r) => r.person === person), [data, person]);

  return (
    <>
      <Space style={{ marginBottom: 18 }}>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={busy} onClick={compute}>计算提成</Button>
        <Button icon={<DownloadOutlined />} onClick={() => workflowApi.downloadExport(month)}>导出 Excel</Button>
      </Space>

      {!has ? (
        <Card style={{ borderRadius: 8, borderColor: "#E9E9E7" }}><Empty description="尚未计算，点击「计算提成」生成结果" /></Card>
      ) : (
        <>
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={8}><Kpi icon={<DollarOutlined />} title="提成总额" value={"¥" + total.toFixed(2)} accent="#2383E2" /></Col>
            <Col span={8}><Kpi icon={<TeamOutlined />} title="参与营业员" value={String(data!.salary.length)} accent="#0F7B6C" /></Col>
            <Col span={8}><Kpi icon={<DollarOutlined />} title="人均提成" value={"¥" + avg.toFixed(2)} accent="#6F5BD0" /></Col>
          </Row>

          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={10}>
              <Card size="small" title={<Space><BarChartOutlined /> 达成档位分布</Space>} style={{ borderRadius: 8, borderColor: "#E9E9E7" }} styles={{ body: { padding: 18 } }}>
                <BucketChart rows={data!.breakdown} />
              </Card>
            </Col>
            <Col span={14}>
              <Card size="small" title={<Space><TeamOutlined /> 提成 Top 5</Space>} style={{ borderRadius: 8, borderColor: "#E9E9E7" }} styles={{ body: { padding: "10px 16px" } }}>
                {top5.map((p, i) => (
                  <div key={p.person} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < 4 ? "1px solid #F1F1EF" : "none" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", flex: "0 0 24px", display: "flex", alignItems: "center", justifyContent: "center",
                      background: i < 3 ? MEDAL[i] : "#EFEFED", color: i < 3 ? "#fff" : "#9B9A97", fontWeight: 700, fontSize: 12 }}>{i + 1}</div>
                    <Text strong style={{ flex: 1, color: "#37352F" }}>{p.person}</Text>
                    <span className="tnum" style={{ fontWeight: 700, color: "#37352F" }}>¥{p.commission.toFixed(2)}</span>
                  </div>
                ))}
              </Card>
            </Col>
          </Row>

          <Card size="small" title="工资明细（点击查看每人「人×店」）" style={{ borderRadius: 8, borderColor: "#E9E9E7" }} styles={{ body: { padding: 0 } }}>
            <Table rowKey="person" size="middle" dataSource={data!.salary} pagination={{ pageSize: 12, showSizeChanger: false }}
              onRow={(r) => ({ onClick: () => { setPerson(r.person); setOpen(true); }, style: { cursor: "pointer" } })}
              columns={[
                { title: "#", width: 50, render: (_, __, i) => i < 3
                    ? <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: "50%", background: MEDAL[i], color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                    : <span style={{ color: "#9B9A97" }}>{i + 1}</span> },
                { title: "营业员", dataIndex: "person", render: (v) => <Text strong style={{ color: "#37352F" }}>{v}</Text> },
                { title: "提成合计", dataIndex: "commission", align: "right", width: 140,
                  render: (v: number) => <span className="tnum" style={{ color: "#37352F", fontWeight: 700 }}>¥{v.toFixed(2)}</span> },
              ]} />
          </Card>
        </>
      )}

      <Drawer title={<Space><TeamOutlined /> {person} 的提成明细</Space>} open={open} onClose={() => setOpen(false)} size="large"
              styles={{ body: { padding: 16 } }}>
        <Table rowKey={(r) => r.person + r.store} size="small" dataSource={personDetail} pagination={{ pageSize: 50 }}
               columns={[
                 { title: "门店", dataIndex: "store" },
                 { title: "业绩", dataIndex: "sales", align: "right", render: (v: number) => <span className="tnum">{v?.toFixed(0)}</span> },
                 { title: "目标", dataIndex: "target", align: "right", render: (v: number) => <span className="tnum">{v?.toFixed(0)}</span> },
                 { title: "达成", dataIndex: "achievement", align: "right", render: (v: number) => <span className="tnum">{(v * 100).toFixed(0)}%</span> },
                 { title: "档", dataIndex: "bucket", align: "center", render: (b: string) => <Tag color={BUCKET_COLOR[b] || "default"} style={{ borderRadius: 4 }}>{b}</Tag> },
                 { title: "提成", dataIndex: "commission", align: "right", render: (v: number) => <span className="tnum" style={{ fontWeight: 700 }}>¥{v.toFixed(2)}</span> },
               ]} />
      </Drawer>
    </>
  );
}
