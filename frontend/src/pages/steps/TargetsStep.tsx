import { useEffect, useState } from "react";
import { Table, InputNumber, Button, message } from "antd";
import { targetsApi } from "../../api";

interface Row {
  store: string;
  target: number;
}

export default function TargetsStep({ month }: { month: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await targetsApi.get(month);
      const items = Object.values(data)[0] || {};
      setRows(
        Object.entries(items).map(([store, target]) => ({
          store,
          target: Number(target),
        })),
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    await targetsApi.set(
      month,
      rows.map((r) => ({ store: r.store, target: String(r.target) })),
    );
    message.success("目标已保存");
  };

  return (
    <>
      <Button onClick={save} style={{ marginBottom: 12 }} type="primary">
        保存目标
      </Button>
      <Table
        rowKey="store"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: "门店", dataIndex: "store" },
          {
            title: "月度目标",
            dataIndex: "target",
            render: (_, r) => (
              <InputNumber
                value={r.target}
                onChange={(v) => {
                  r.target = Number(v || 0);
                  setRows([...rows]);
                }}
              />
            ),
          },
        ]}
      />
    </>
  );
}
