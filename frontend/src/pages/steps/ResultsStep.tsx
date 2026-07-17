import { useEffect, useMemo, useState } from "react";
import { workflowApi } from "../../api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, Zap, Users, DollarSign, BarChart3 } from "lucide-react";
import { Block, Callout } from "@/components/Block";
import ResultTable from "../../components/ResultTable";

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

export default function ResultsStep({
  month,
  onComputed,
}: {
  month: string;
  onComputed?: () => void;
}) {
  const [data, setData] = useState<ResultData | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAnomalies, setPendingAnomalies] = useState(0);

  const load = async () => {
    try {
      setData(await workflowApi.getResults(month));
    } catch {
      setData(null);
    }
  };
  useEffect(() => {
    load();
    // 检查待处理异常
    import("../../api").then(({ anomalyApi }) =>
      anomalyApi.list(month, "pending").then((a) => setPendingAnomalies(a.length)).catch(() => {})
    );
  }, [month]);

  const compute = async () => {
    if (pendingAnomalies > 0) {
      toast.error(`有 ${pendingAnomalies} 个异常未处理，请先处理`);
      return;
    }
    setBusy(true);
    try {
      const r = await workflowApi.compute(month);
      toast.success(`计算完成：${r.details} 条，总额 ¥${r.total.toFixed(2)}`);
      onComputed?.();
      await load();
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
  const has = !!data && data.salary.length > 0;

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Button onClick={compute} disabled={busy}>
          <Zap className="w-4 h-4 mr-1.5" />
          {busy ? "计算中..." : "计算提成"}
        </Button>
        <Button variant="outline" onClick={() => workflowApi.downloadExport(month)}>
          <Download className="w-4 h-4 mr-1.5" />
          导出 Excel
        </Button>
        {pendingAnomalies > 0 && (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">
            {pendingAnomalies} 个异常待处理
          </Badge>
        )}
      </div>

      {!has ? (
        <Callout variant="info" icon={<BarChart3 className="w-4 h-4" />}>
          尚未计算，点击上方「计算提成」生成结果
        </Callout>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-400">提成总额</p>
                <p className="text-xl font-semibold text-zinc-900 tnum">
                  ¥{total.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-400">参与营业员</p>
                <p className="text-xl font-semibold text-zinc-900 tnum">
                  {data!.salary.length}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-purple-50 text-purple-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-400">人均提成</p>
                <p className="text-xl font-semibold text-zinc-900 tnum">
                  ¥{(total / (data!.salary.length || 1)).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* 下钻结果表格 */}
          <ResultTable month={month} data={data!} />
        </div>
      )}
    </>
  );
}
