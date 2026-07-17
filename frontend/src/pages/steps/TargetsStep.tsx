import { useEffect, useState } from "react";
import { targetsApi } from "../../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface Row { store: string; target: number; }

export default function TargetsStep({ month }: { month: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await targetsApi.get(month);
      const items = Object.values(data)[0] || {};
      setRows(Object.entries(items).map(([store, target]) => ({ store, target: Number(target) })));
    } catch { toast.error("加载目标失败"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await targetsApi.set(month, rows.map((r) => ({ store: r.store, target: String(r.target) })));
      toast.success("目标已保存");
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中..." : "保存目标"}</Button>
      </div>
      {loading ? <p className="text-sm text-zinc-400">加载中...</p> : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-sm">暂无门店数据，请先在门店信息页添加门店</div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>门店</TableHead>
              <TableHead className="text-right w-40">月度目标</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.store}>
                  <TableCell>{r.store}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" value={r.target} onChange={(e) => {
                      r.target = Number(e.target.value || 0);
                      setRows([...rows]);
                    }} className="w-28 h-8 text-right font-mono text-[13px]" />
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
