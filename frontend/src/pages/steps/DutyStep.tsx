import { useEffect, useMemo, useState } from "react";
import { workflowApi, type DutyGrid } from "../../api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function DutyStep({ month }: { month: string }) {
  const [grid, setGrid] = useState<DutyGrid>({});
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});

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

  const cell = (store: string, date: string): string => {
    const k = `${store}|${date}`;
    if (k in edit) return edit[k];
    const v = grid[store]?.[date];
    return typeof v === "string" ? v : "";
  };

  const dataSource = Object.keys(grid).map((store) => {
    const row: Record<string, string | string[]> & { key: string } = { key: store, store };
    for (const d of dates) row[d] = grid[store]?.[d] ?? "";
    return row;
  });

  const multiCount = Object.values(grid).reduce(
    (n, d) => n + Object.values(d).filter((v) => Array.isArray(v)).length, 0);

  const confirm = async () => {
    const items: { store: string; date: string; salesperson: string }[] = [];
    for (const store of Object.keys(grid)) {
      for (const date of Object.keys(grid[store])) {
        const p = cell(store, date);
        if (p) items.push({ store, date, salesperson: p });
      }
    }
    await workflowApi.setDuty(month, items);
    toast.success(`已确认 ${items.length} 条当班`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={infer} disabled={loading}>重新推断</Button>
        {multiCount > 0 ? <Badge className="bg-red-100 text-red-700 border-red-200">{multiCount} 个多人当天</Badge> : <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">无冲突</Badge>}
        <Button size="sm" onClick={confirm} className="bg-zinc-900 hover:bg-zinc-800 ml-auto">确认当班</Button>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/50">
              <th className="text-left px-3 py-2.5 font-medium text-zinc-500 sticky left-0 bg-zinc-50/50 z-10">门店</th>
              {dates.map((d) => <th key={d} className="text-center px-2.5 py-2.5 font-medium text-zinc-500 whitespace-nowrap">{d.slice(5)}</th>)}
            </tr>
          </thead>
          <tbody>
            {dataSource.map((row) => (
              <tr key={row.key} className="border-b border-zinc-100 last:border-0">
                <td className="px-3 py-2 font-medium text-zinc-700 sticky left-0 bg-white z-10">{row.store as string}</td>
                {dates.map((d) => {
                  const v = row[d] as string | string[] | undefined;
                  const k = `${row.store}|${d}`;
                  const cur = cell(row.store as string, d);
                  return (
                    <td key={d} className="text-center px-2 py-1.5">
                      {Array.isArray(v) ? (
                        <Select value={cur || undefined} onValueChange={(val) => setEdit((e) => ({ ...e, [k]: val }))}>
                          <SelectTrigger className="h-7 w-20 text-[12px] border-zinc-300 mx-auto"><SelectValue placeholder="选择" /></SelectTrigger>
                          <SelectContent>{(v as string[]).map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : cur ? <span className="text-sm text-zinc-700">{cur}</span> : <span className="text-sm text-zinc-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
