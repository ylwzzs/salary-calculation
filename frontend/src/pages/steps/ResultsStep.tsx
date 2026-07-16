import { useEffect, useState } from "react";
import { Button, Table, Statistic, message, Drawer, Space } from "antd";
import { workflowApi } from "../../api";

interface ResultData {
  salary: { person: string; commission: number }[];
  breakdown: {
    person: string; store: string; sales: number; target: number;
    achievement: number; bucket: string; commission: number;
  }[];
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

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" loading={busy} onClick={compute}>计算提成</Button>
        <Button onClick={() => workflowApi.downloadExport(month)}>导出 Excel</Button>
        {data && data.salary.length > 0 && (
          <Statistic title="提成总额"
                     value={data.salary.reduce((s, x) => s + x.commission, 0)}
                     precision={2} prefix="¥" />
        )}
      </Space>
      <Table rowKey="person" size="small"
             dataSource={data?.salary || []}
             columns={[
               { title: "营业员", dataIndex: "person" },
               { title: "提成合计", dataIndex: "commission", render: (v: number) => v.toFixed(2) },
             ]}
             onRow={() => ({ onClick: () => setOpen(true), style: { cursor: "pointer" } })}
             locale={{ emptyText: "尚未计算" }} />
      <Drawer title="提成明细（人×店）" open={open} onClose={() => setOpen(false)} width={720}>
        <Table rowKey={(r) => r.person + r.store} size="small"
               dataSource={data?.breakdown || []} pagination={{ pageSize: 50 }}
               columns={[
                 { title: "营业员", dataIndex: "person" },
                 { title: "门店", dataIndex: "store" },
                 { title: "业绩", dataIndex: "sales", render: (v: number) => v?.toFixed(0) },
                 { title: "目标", dataIndex: "target", render: (v: number) => v?.toFixed(0) },
                 { title: "达成", dataIndex: "achievement", render: (v: number) => (v * 100).toFixed(0) + "%" },
                 { title: "档", dataIndex: "bucket" },
                 { title: "提成", dataIndex: "commission", render: (v: number) => v.toFixed(2) },
               ]} />
      </Drawer>
    </>
  );
}
