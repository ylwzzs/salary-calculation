import { useEffect, useMemo, useState } from "react";
import { workflowApi } from "../../api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Zap, Users, DollarSign, BarChart3 } from "lucide-react";

interface Breakdown { person: string; store: string; sales: number; target: number; achievement: number; bucket: string; commission: number; }
interface ResultData { salary: { person: string; commission: number }[]; breakdown: Breakdown[]; }

const BUCKETS = [
  { key: "GE_100", label: "≥100%", color: "bg-emerald-500" },
  { key: "90_100", label: "90~99%", color: "bg-blue-500" },
  { key: "80_90", label: "80~89%", color: "bg-violet-500" },
  { key: "70_80", label: "70~79%", color: "bg-amber-500" },
  { key: "LT_70", label: "<70%", color: "bg-zinc-400" },
];
const BUCKET_LABELS: Record<string, string> = Object.fromEntries(BUCKETS.map((b) => [b.key, b.label]));
const BUCKET_COLORS: Record<string, string> = Object.fromEntries(BUCKETS.map((b) => [b.key, b.color]));
const MEDAL = ["bg-amber-500", "bg-zinc-400", "bg-amber-700"];

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0">{icon}</div>
      <div><p className="text-[12px] text-zinc-400">{label}</p><p className="text-xl font-semibold text-zinc-900 tnum">{value}</p></div>
    </div>
  );
}

function BucketChart({ rows }: { rows: Breakdown[] }) {
  const counts = BUCKETS.map((b) => ({ ...b, n: rows.filter((r) => r.bucket === b.key).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  const total = counts.reduce((s, c) => s + c.n, 0);
  return (
    <div className="space-y-2.5">
      {counts.map((c) => (
        <div key={c.key} className="flex items-center gap-3">
          <span className="w-[52px] text-[13px] text-zinc-500 text-right">{c.label}</span>
          <div className="flex-1 h-4 bg-zinc-100 rounded-md overflow-hidden">
            <div className={`${c.color} h-full rounded-md transition-all duration-500`} style={{ width: `${(c.n / max) * 100}%` }} />
          </div>
          <span className="w-7 text-[13px] font-medium text-zinc-800 text-right tnum">{c.n}</span>
          <span className="w-9 text-[11px] text-zinc-400 text-right">{total ? Math.round((c.n / total) * 100) : 0}%</span>
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
    try { const r = await workflowApi.compute(month); toast.success(`计算完成：${r.details} 条，总额 ¥${r.total.toFixed(2)}`); onComputed?.(); await load(); }
    catch (e: unknown) { const msg = (e as { response?: { data?: { detail?: string } }; message?: string }); toast.error("计算失败：" + (msg.response?.data?.detail || msg.message)); }
    finally { setBusy(false); }
  };

  const total = data ? data.salary.reduce((s, x) => s + x.commission, 0) : 0;
  const has = !!data && data.salary.length > 0;
  const top5 = useMemo(() => (data?.salary || []).slice(0, 5), [data]);
  const detail = useMemo(() => (data?.breakdown || []).filter((r) => r.person === person), [data, person]);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Button onClick={compute} disabled={busy} className="bg-zinc-900 hover:bg-zinc-800"><Zap className="w-4 h-4 mr-1.5" />计算提成</Button>
        <Button variant="outline" onClick={() => workflowApi.downloadExport(month)}><Download className="w-4 h-4 mr-1.5" />导出 Excel</Button>
      </div>

      {!has ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center text-zinc-400">尚未计算</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <KpiCard icon={<DollarSign className="w-5 h-5" />} label="提成总额" value={`¥${total.toFixed(2)}`} />
            <KpiCard icon={<Users className="w-5 h-5" />} label="参与营业员" value={String(data!.salary.length)} />
            <KpiCard icon={<DollarSign className="w-5 h-5" />} label="人均提成" value={`¥${(total / data!.salary.length).toFixed(2)}`} />
          </div>
          <div className="grid grid-cols-[1fr_1.3fr] gap-3 mb-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-medium text-zinc-500 mb-3 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" />达成档位分布</h3>
              <BucketChart rows={data!.breakdown} />
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-medium text-zinc-500 mb-3">提成 Top 5</h3>
              <div className="divide-y divide-zinc-100">
                {top5.map((p, i) => (
                  <div key={p.person} className="flex items-center gap-3 py-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0 ${i < 3 ? MEDAL[i] : "bg-zinc-200 text-zinc-500"}`}>{i + 1}</div>
                    <span className="flex-1 text-sm font-medium text-zinc-800">{p.person}</span>
                    <span className="tnum text-sm font-semibold text-zinc-900">¥{p.commission.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-500">工资明细（点击查看每人「人×店」）</h3>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>营业员</TableHead>
                <TableHead className="text-right">提成合计</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data!.salary.map((r, i) => (
                  <TableRow key={r.person} className="cursor-pointer hover:bg-zinc-50" onClick={() => { setPerson(r.person); setOpen(true); }}>
                    <TableCell>
                      {i < 3
                        ? <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[11px] font-bold text-white ${MEDAL[i]}`}>{i + 1}</span>
                        : <span className="text-zinc-400 text-[13px]">{i + 1}</span>}
                    </TableCell>
                    <TableCell className="font-medium">{r.person}</TableCell>
                    <TableCell className="text-right tnum font-semibold text-zinc-900">¥{r.commission.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── 明细抽屉 ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative w-full max-w-[680px] bg-white shadow-xl border-l border-zinc-200 h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-zinc-100 px-5 py-3.5 flex items-center justify-between z-10">
              <h3 className="text-sm font-semibold">{person} 的提成明细</h3>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
            </div>
            <div className="p-4">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>门店</TableHead><TableHead>业绩</TableHead><TableHead>目标</TableHead>
                  <TableHead>达成</TableHead><TableHead>档</TableHead><TableHead className="text-right">提成</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {detail.map((r) => (
                    <TableRow key={r.person + r.store}>
                      <TableCell>{r.store}</TableCell>
                      <TableCell className="tnum">{r.sales?.toFixed(0)}</TableCell>
                      <TableCell className="tnum">{r.target?.toFixed(0)}</TableCell>
                      <TableCell className="tnum">{(r.achievement * 100).toFixed(0)}%</TableCell>
                      <TableCell><Badge variant="outline" className={`text-[11px] ${BUCKET_COLORS[r.bucket] || ""} text-white border-0`}>{BUCKET_LABELS[r.bucket] || r.bucket}</Badge></TableCell>
                      <TableCell className="text-right tnum font-semibold">¥{r.commission.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
