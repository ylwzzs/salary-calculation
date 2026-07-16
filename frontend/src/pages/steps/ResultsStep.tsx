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

const BUCKETS = [
  { key: "GE_100", label: "≥100%", color: "#059669" },
  { key: "90_100", label: "90~99%", color: "#2563EB" },
  { key: "80_90", label: "80~89%", color: "#0891B2" },
  { key: "70_80", label: "70~79%", color: "#D97706" },
  { key: "LT_70", label: "<70%", color: "#94A3B8" },
];
const BUCKET_COLOR: Record<string, string> = Object.fromEntries(BUCKETS.map((b) => [b.key, b.color]));
const MEDAL = ["#F59E0B", "#94A3B8", "#B45309"]; // 金 银 铜

function Kpi({ icon, title, value, accent }: { icon: ReactNode; title: string; value: string; accent: string }) {
  return (
    <Card size="small" style={{ borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${accent}14, #ffffff 60%)` }} styles={{ body: { padding: 16 } }}>
      <Space align="center" size={14}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div>
        <div>
          <div style={{ color: "#64748B", fontSize: 12 }}>{title}</div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", lineHeight: 1.2 }}>{value}</div>
        </div>
      </Space>
    </Card>
  );
}

/** 达成档位分布：横向条形 */
function BucketChart({ rows }: { rows: Breakdown[] }) {
  const counts = BUCKETS.map((b) => ({ ...b, n: rows.filter((r) => r.bucket === b.key).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  const total = counts.reduce((s, c) => s + c.n, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {counts.map((c) => (
        <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 64, fontSize: 12, color: "#475569" }}>{c.label}</div>
          <div style={{ flex: 1, height: 18, background: "#F1F5F9", borderRadius: 9, overflow: "hidden" }}>
            <div style={{ width: `${(c.n / max) * 100}%`, height: "100%", background: c.color, borderRadius: 9, transition: "width .4s" }} />
          </div>
          <div className="tnum" style={{ width: 40, textAlign: "right", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{c.n}</div>
          <div style={{ width: 40, textAlign: "right", fontSize: 11, color: "#94A3B8" }}>{total ? Math.round((c.n / total) * 100) : 0}%</div>
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
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={busy} onClick={compute}>计算提成</Button>
        <Button icon={<DownloadOutlined />} onClick={() => workflowApi.downloadExport(month)}>导出 Excel</Button>
      </Space>

      {!has ? (
        <Card style={{ borderRadius: 12 }}><Empty description="尚未计算，点击「计算提成」生成结果" /></Card>
      ) : (
        <>
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={8}><Kpi icon={<DollarOutlined />} title="提成总额" value={"¥" + total.toFixed(2)} accent="#2563EB" /></Col>
            <Col span={8}><Kpi icon={<TeamOutlined />} title="参与营业员" value={String(data!.salary.length)} accent="#059669" /></Col>
            <Col span={8}><Kpi icon={<DollarOutlined />} title="人均提成" value={"¥" + avg.toFixed(2)} accent="#7C3AED" /></Col>
          </Row>

          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={10}>
              <Card size="small" title={<Space><BarChartOutlined /> 达成档位分布</Space>} style={{ borderRadius: 12 }} styles={{ body: { padding: 18 } }}>
                <BucketChart rows={data!.breakdown} />
              </Card>
            </Col>
            <Col span={14}>
              <Card size="small" title={<Space><TeamOutlined /> 提成 Top 5</Space>} style={{ borderRadius: 12 }} styles={{ body: { padding: "12px 16px" } }}>
                {top5.map((p, i) => (
                  <div key={p.person} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", borderBottom: i < 4 ? "1px solid #F1F5F9" : "none" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", flex: "0 0 26px", display: "flex", alignItems: "center", justifyContent: "center",
                      background: i < 3 ? MEDAL[i] : "#E2E8F0", color: i < 3 ? "#fff" : "#64748B", fontWeight: 700, fontSize: 13 }}>{i + 1}</div>
                    <Text strong style={{ flex: 1 }}>{p.person}</Text>
                    <span className="tnum" style={{ fontWeight: 700, color: "#2563EB" }}>¥{p.commission.toFixed(2)}</span>
                  </div>
                ))}
              </Card>
            </Col>
          </Row>

          <Card size="small" title="工资明细（点击查看每人「人×店」）" style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
            <Table rowKey="person" size="middle" dataSource={data!.salary} pagination={{ pageSize: 12, showSizeChanger: false }}
              onRow={(r) => ({ onClick: () => { setPerson(r.person); setOpen(true); }, style: { cursor: "pointer" } })}
              columns={[
                { title: "#", width: 50, render: (_, __, i) => i < 3
                    ? <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: "50%", background: MEDAL[i], color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                    : <span style={{ color: "#94A3B8" }}>{i + 1}</span> },
                { title: "营业员", dataIndex: "person", render: (v) => <Text strong>{v}</Text> },
                { title: "提成合计", dataIndex: "commission", align: "right", width: 140,
                  render: (v: number) => <span className="tnum" style={{ color: "#2563EB", fontWeight: 700 }}>¥{v.toFixed(2)}</span> },
              ]} />
          </Card>
        </>
      )}

      <Drawer title={<Space><TeamOutlined /> {person} 的提成明细</Space>} open={open} onClose={() => setOpen(false)} width={760}
              styles={{ body: { padding: 16 } }}>
        <Table rowKey={(r) => r.person + r.store} size="small" dataSource={personDetail} pagination={{ pageSize: 50 }}
               columns={[
                 { title: "门店", dataIndex: "store" },
                 { title: "业绩", dataIndex: "sales", align: "right", render: (v: number) => <span className="tnum">{v?.toFixed(0)}</span> },
                 { title: "目标", dataIndex: "target", align: "right", render: (v: number) => <span className="tnum">{v?.toFixed(0)}</span> },
                 { title: "达成", dataIndex: "achievement", align: "right", render: (v: number) => <span className="tnum">{(v * 100).toFixed(0)}%</span> },
                 { title: "档", dataIndex: "bucket", align: "center", render: (b: string) => <Tag color={BUCKET_COLOR[b] || "default"}>{b}</Tag> },
                 { title: "提成", dataIndex: "commission", align: "right", render: (v: number) => <span className="tnum" style={{ fontWeight: 700 }}>¥{v.toFixed(2)}</span> },
               ]} />
      </Drawer>
    </>
  );
}
