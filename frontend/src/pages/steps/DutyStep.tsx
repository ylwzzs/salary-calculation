import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button, Table, Tag, message, Select } from "antd";
import { workflowApi, type DutyGrid } from "../../api";

export default function DutyStep({ month }: { month: string }) {
  const [grid, setGrid] = useState<DutyGrid>({});
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({}); // "store|date" -> picked person

  const dates = useMemo(() => {
    const s = new Set<string>();
    Object.values(grid).forEach((d) => Object.keys(d).forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [grid]);

  const infer = async () => {
    setLoading(true);
    try { setGrid(await workflowApi.inferDuty(month)); setEdit({}); } finally { setLoading(false); }
  };
  useEffect(() => { infer(); }, []);

  const cellPerson = (store: string, date: string): string => {
    const key = `${store}|${date}`;
    if (key in edit) return edit[key];
    const v = grid[store]?.[date];
    return typeof v === "string" ? v : "";
  };

  const dataSource = Object.keys(grid).map((store) => {
    const row: Record<string, unknown> = { key: store, store };
    for (const d of dates) row[d] = grid[store]?.[d];
    return row;
  });

  const columns: { title: string; dataIndex: string; fixed?: "left"; width?: number; render?: (v: any, row: any) => ReactNode }[] = [
    { title: "门店", dataIndex: "store", fixed: "left", width: 120 },
    ...dates.map((d) => ({
      title: d.slice(5), dataIndex: d, width: 90,
      render: (v: any, row: any) => {
        const store = row.store as string;
        const key = `${store}|${d}`;
        const cur = cellPerson(store, d);
        if (Array.isArray(v)) {
          return (
            <Select size="small" value={cur || undefined} placeholder="选1人" style={{ width: 80 }}
                    options={(v as string[]).map((p) => ({ value: p, label: p }))}
                    onChange={(val: string) => setEdit({ ...edit, [key]: val })} />
          );
        }
        return cur ? <span>{cur}</span> : <Tag>无</Tag>;
      },
    })),
  ];

  const confirm = async () => {
    const items: { store: string; date: string; salesperson: string }[] = [];
    for (const store of Object.keys(grid)) {
      for (const date of Object.keys(grid[store])) {
        const p = cellPerson(store, date);
        if (p) items.push({ store, date, salesperson: p });
      }
    }
    await workflowApi.setDuty(month, items);
    message.success(`已确认 ${items.length} 条当班`);
  };

  const multiCount = Object.values(grid).reduce(
    (n, d) => n + Object.values(d).filter((v) => Array.isArray(v)).length, 0);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button onClick={infer} loading={loading}>重新推断</Button>
        <span style={{ marginLeft: 12 }}>
          {multiCount > 0 ? <Tag color="red">{multiCount} 个多人当天待选</Tag> : <Tag color="green">无多人冲突</Tag>}
        </span>
        <Button type="primary" onClick={confirm} style={{ marginLeft: 12 }}>确认当班</Button>
      </div>
      <Table columns={columns} dataSource={dataSource} pagination={false} scroll={{ x: "max-content", y: 400 }} size="small" />
    </>
  );
}
