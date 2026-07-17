import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { monthsApi, type MonthInfo } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function Months() {
  const nav = useNavigate();
  const [rows, setRows] = useState<MonthInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState("");
  const [copyFrom, setCopyFrom] = useState("");

  const load = async () => { setLoading(true); try { setRows(await monthsApi.list()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!month.match(/^\d{4}-\d{2}$/)) { toast.error("格式应为 YYYY-MM"); return; }
    await monthsApi.create(month, copyFrom || undefined);
    toast.success("已建月"); setOpen(false); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">月度计算</h2>
        <Button size="sm" onClick={() => { setMonth(""); setCopyFrom(""); setOpen(true); }}><Plus className="w-4 h-4 mr-1.5" />新建月份</Button>
      </div>
      {rows.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-400 text-sm">暂无月份数据，点击上方「新建月份」开始</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((m) => (
          <div key={m.month} onClick={() => nav(`/months/${m.month}`)}
            className="rounded-lg border border-zinc-200 bg-white p-4 cursor-pointer hover:border-zinc-300 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-zinc-900">{m.month}</span>
              <Badge variant={m.status === "computed" ? "default" : "secondary"}>{m.status === "computed" ? "已计算" : "进行中"}</Badge>
            </div>
            <div className="text-xs text-zinc-400 space-y-0.5">
              <p>销售: {m.sales_file ? "✓" : "—"}　让利: {m.gifts_file ? "✓" : "—"}</p>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>新建月份</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-[13px]">月份 (YYYY-MM)</Label><Input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-07" className="mt-1 h-9" /></div>
            <div><Label className="text-[13px]">复制上月目标 (可选)</Label><Input value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} placeholder="2026-06" className="mt-1 h-9" /></div>
          </div>
          <DialogFooter><Button onClick={create} className="">创建</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
