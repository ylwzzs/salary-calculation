import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { monthsApi, monthStepApi, type MonthInfo } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const STEP_LABELS: Record<string, string> = {
  import: "① 导入数据",
  targets: "② 配置目标",
  duty: "③ 当班确认",
  results: "④ 待计算",
};

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

  const handleCardClick = (m: MonthInfo) => {
    if (m.status === "computed") {
      nav(`/months/${m.month}?step=results`);
    } else {
      const step = m.current_step || "import";
      nav(`/months/${m.month}?step=${step}`);
    }
  };

  const handleReset = async (e: React.MouseEvent, month: string) => {
    e.stopPropagation();
    if (!confirm("确定重新计算？将清除现有结果并回到第一步。")) return;
    try {
      await monthStepApi.reset(month);
      toast.success("已重置");
      load();
      nav(`/months/${month}?step=import`);
    } catch {
      toast.error("重置失败");
    }
  };

  const getStepSummary = (m: MonthInfo) => {
    if (m.status === "computed") {
      return { label: "已计算", color: "default", summary: "所有步骤已完成" };
    }
    const step = m.current_step || "import";
    return { label: STEP_LABELS[step] || "进行中", color: "secondary" };
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
        {rows.map((m) => {
          const status = getStepSummary(m);
          return (
            <div
              key={m.month}
              onClick={() => handleCardClick(m)}
              className={cn(
                "rounded-lg border bg-white p-4 cursor-pointer hover:shadow-sm transition-all group",
                m.status === "computed" ? "border-emerald-200" : "border-zinc-200 hover:border-blue-200"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-zinc-900">{m.month}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={m.status === "computed" ? "default" : "secondary"}>
                    {status.label}
                  </Badge>
                  {m.status === "computed" && (
                    <button
                      onClick={(e) => handleReset(e, m.month)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-orange-500"
                      title="重新计算"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-xs text-zinc-400 space-y-0.5">
                <p>销售: {m.sales_file ? "✓" : "—"}　让利: {m.gifts_file ? "✓" : "—"}</p>
              </div>
            </div>
          );
        })}
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

