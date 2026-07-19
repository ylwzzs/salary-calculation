import { useEffect, useState } from "react";
import { workflowApi, workflowApiExtended, anomalyApi } from "../../api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, Download, Users, DollarSign, CheckCircle2, AlertTriangle } from "lucide-react";
import ResultTable from "../../components/ResultTable";
import AnomalyPanel from "./AnomalyPanel";

interface Breakdown {
  person: string;
  store: string;
  sales: number;
  target: number;
  achievement: number;
  bucket: string;
  commission: number;
}
interface ResultData {
  salary: { person: string; commission: number }[];
  breakdown: Breakdown[];
}

export default function ResultsStep({
  month,
  onComputed,
}: {
  month: string;
  onComputed?: () => void;
}) {
  const [data, setData] = useState<ResultData | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingAnomalies, setPendingAnomalies] = useState(0);
  const [phase, setPhase] = useState<"check" | "compute" | "result">("check");

  const loadResults = async () => {
    try {
      const r = await workflowApi.getResults(month);
      if (r && r.salary && r.salary.length > 0) {
        setData(r);
        setPhase("result");
      } else {
        setPhase("compute");
      }
    } catch {
      setPhase("compute");
    }
  };

  const refreshAnomalies = async () => {
    try {
      await workflowApiExtended.checkAnomalies(month);
      const anomalies = await anomalyApi.list(month, "pending");
      setPendingAnomalies(anomalies.length);
      return anomalies.length;
    } catch {
      return 0;
    }
  };

  useEffect(() => {
    const init = async () => {
      const count = await refreshAnomalies();
      if (count === 0) {
        await loadResults();
      } else {
        setPhase("check");
      }
    };
    init();
  }, [month]);

  const handleAnomalyResolved = async () => {
    const count = await refreshAnomalies();
    if (count === 0) {
      setPhase("compute");
    }
  };

  const compute = async () => {
    setBusy(true);
    try {
      // 再次检查异常
      const count = await refreshAnomalies();
      if (count > 0) {
        toast.error(`发现 ${count} 个异常，请先处理`);
        setPhase("check");
        setBusy(false);
        return;
      }

      const r = await workflowApi.compute(month);
      toast.success(`计算完成：${r.details} 条，总额 ¥${r.total.toFixed(2)}`);
      onComputed?.();
      await loadResults();
    } catch (e: unknown) {
      const msg = e as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      toast.error("计算失败：" + (msg.response?.data?.detail || msg.message));
    } finally {
      setBusy(false);
    }
  };

  const total = data ? data.salary.reduce((s, x) => s + x.commission, 0) : 0;

  return (
    <div className="space-y-4">
      {/* 阶段1: 异常排查 */}
      {phase === "check" && (
        <>
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">异常排查</span>
            <span className="text-sm">请处理以下异常后再计算</span>
          </div>
          <AnomalyPanel month={month} onResolved={handleAnomalyResolved} />
        </>
      )}

      {/* 阶段2: 可以计算 */}
      {phase === "compute" && (
        <>
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">异常已清除</span>
            <span className="text-sm">点击下方按钮开始计算</span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={compute} disabled={busy}>
              <Zap className="w-4 h-4 mr-1.5" />
              {busy ? "计算中..." : "计算提成"}
            </Button>
            <Button variant="outline" onClick={async () => {
              const count = await refreshAnomalies();
              if (count > 0) setPhase("check");
              else toast.info("无异常");
            }}>
              重新检查异常
            </Button>
          </div>
        </>
      )}

      {/* 阶段3: 计算结果 */}
      {phase === "result" && data && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button onClick={compute} disabled={busy} variant="outline" size="sm">
                <Zap className="w-3.5 h-3.5 mr-1" />
                重新计算
              </Button>
              <Button variant="outline" size="sm" disabled={exporting} onClick={async () => {
                setExporting(true);
                try {
                  await workflowApi.downloadExport(month);
                  toast.success("导出成功");
                } catch {
                  toast.error("导出失败");
                } finally {
                  setExporting(false);
                }
              }}>
                <Download className="w-3.5 h-3.5 mr-1" />
                {exporting ? "导出中..." : "导出 Excel"}
              </Button>
            </div>
            {pendingAnomalies > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 cursor-pointer" onClick={() => setPhase("check")}>
                {pendingAnomalies} 个异常待处理
              </Badge>
            )}
          </div>

          {/* KPI卡片 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-400">提成总额</p>
                <p className="text-xl font-semibold text-zinc-900 tnum">¥{total.toFixed(2)}</p>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-400">参与营业员</p>
                <p className="text-xl font-semibold text-zinc-900 tnum">{data.salary.length}</p>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-purple-50 text-purple-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-400">人均提成</p>
                <p className="text-xl font-semibold text-zinc-900 tnum">¥{(total / (data.salary.length || 1)).toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* 下钻结果表格 */}
          <ResultTable month={month} data={data} />
        </>
      )}
    </div>
  );
}
