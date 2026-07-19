import { useEffect, useState } from "react";
import { targetsApi, storesApi, monthStepApi } from "../../api";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface Row {
  store: string;
  group: string;
  store_class: string;
  target: number;
}

export default function TargetsStep({ month }: { month: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const stores = await storesApi.list();
      const activeStores = stores.filter((s) => !s.exclude_assessment);
      const targetMap = new Map<string, number>();
      try {
        const data = await targetsApi.get(month);
        const items = Object.values(data)[0] || {};
        Object.entries(items).forEach(([store, target]) => {
          targetMap.set(store, Number(target));
        });
      } catch {
        // 目标加载失败不影响门店显示
      }
      setRows(activeStores.map((s) => ({
        store: s.name,
        group: s.group || "-",
        store_class: s.store_class || "-",
        target: targetMap.get(s.name) || 0,
      })));
    } catch {
      toast.error("加载门店失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [month]);

  const saveTarget = async (store: string, value: number) => {
    try {
      await targetsApi.set(month, [{ store, target: String(value) }]);
      await monthStepApi.update(month, "targets", { targets: true }).catch(() => {});
      toast.success(`${store} 目标已保存`);
    } catch {
      toast.error(`${store} 保存失败`);
    }
  };

  const total = rows.reduce((s, r) => s + r.target, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {!loading && rows.length > 0 && (
          <span className="text-sm text-zinc-500">
            目标总额：<strong className="text-zinc-800">¥{total.toLocaleString()}</strong>
          </span>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-zinc-400">加载中...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-sm">
          暂无门店数据，请先在门店信息页添加门店
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>门店</TableHead>
                <TableHead className="w-20">组别</TableHead>
                <TableHead className="w-20">类别</TableHead>
                <TableHead className="text-right w-40">月度目标</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.store}>
                  <TableCell>{r.store}</TableCell>
                  <TableCell className="text-zinc-500">{r.group}</TableCell>
                  <TableCell className="text-zinc-500">{r.store_class}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={r.target}
                      onChange={(e) => {
                        r.target = Number(e.target.value || 0);
                        setRows([...rows]);
                      }}
                      onBlur={(e) => saveTarget(r.store, Number(e.target.value || 0))}
                      className="w-28 h-8 text-right font-mono text-[13px]"
                      min={0}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
