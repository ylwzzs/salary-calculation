import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { monthsApi, monthStepApi, type MonthInfo } from "../api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { key: "import", label: "导入数据" },
  { key: "targets", label: "配置目标" },
  { key: "duty", label: "当班确认" },
  { key: "results", label: "计算结果" },
];

export default function Months() {
  const nav = useNavigate();
  const [rows, setRows] = useState<MonthInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => { setLoading(true); try { setRows(await monthsApi.list()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

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

  const getStepProgress = (m: MonthInfo) => {
    const stepData = m.step_data || {};
    return STEPS.map((s) => ({
      ...s,
      done: !!stepData[s.key],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">月度计算</h2>
      </div>
      {rows.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-400 text-sm">暂无月份数据</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((m) => {
          const isComputed = m.status === "computed";
          const steps = getStepProgress(m);
          return (
            <div
              key={m.month}
              onClick={() => handleCardClick(m)}
              className={cn(
                "rounded-lg border bg-white p-4 cursor-pointer hover:shadow-sm transition-all group",
                isComputed ? "border-emerald-200" : "border-zinc-200 hover:border-blue-200"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-zinc-900">{m.month}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={isComputed ? "default" : "secondary"}>
                    {isComputed ? "已计算" : "进行中"}
                  </Badge>
                  {isComputed && (
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
              {/* 步骤进度 */}
              <div className="flex items-center gap-1">
                {steps.map((s, i) => (
                  <div key={s.key} className="flex items-center flex-1 min-w-0">
                    <div
                      className={cn(
                        "flex-1 h-1.5 rounded-full transition-colors",
                        s.done ? "bg-emerald-400" : "bg-zinc-200"
                      )}
                    />
                    {i < steps.length - 1 && (
                      <div className={cn("w-1.5 h-1.5 rounded-full mx-0.5 shrink-0", s.done ? "bg-emerald-400" : "bg-zinc-300")} />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
                {steps.map((s) => (
                  <span key={s.key} className={s.done ? "text-emerald-600" : ""}>
                    {s.done ? "✓" : "·"} {s.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
