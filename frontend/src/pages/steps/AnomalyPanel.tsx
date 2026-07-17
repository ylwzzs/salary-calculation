import { useEffect, useState } from "react";
import { anomalyApi, type Anomaly } from "../../api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";

interface AnomalyPanelProps {
  month: string;
  onResolved: () => void;
}

const ANOMALY_LABELS: Record<string, { label: string; icon: string }> = {
  "1": { label: "门店不存在", icon: "🏪" },
  "2": { label: "商品不存在", icon: "📦" },
  "3": { label: "门店无目标", icon: "🎯" },
  "4": { label: "商品信息不完整", icon: "📋" },
  "5": { label: "赠送未匹配", icon: "🎁" },
  "6": { label: "退款未关联", icon: "↩️" },
};

export default function AnomalyPanel({ month, onResolved }: AnomalyPanelProps) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await anomalyApi.list(month, "pending");
      setAnomalies(data);
    } catch {
      toast.error("加载异常失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [month]);

  const handleResolve = async (id: number) => {
    try {
      await anomalyApi.resolve(id);
      toast.success("已处理");
      load();
      onResolved();
    } catch {
      toast.error("处理失败");
    }
  };

  const handleIgnore = async (id: number) => {
    try {
      await anomalyApi.ignore(id);
      toast.success("已忽略");
      load();
      onResolved();
    } catch {
      toast.error("忽略失败");
    }
  };

  if (loading) {
    return <div className="text-sm text-zinc-400">加载异常...</div>;
  }

  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg px-4 py-3">
        <CheckCircle2 className="w-4 h-4" />
        无待处理异常，可以继续计算
      </div>
    );
  }

  // 按异常类型分组
  const grouped: Record<string, Anomaly[]> = {};
  anomalies.forEach((a) => {
    grouped[a.anomaly_type] = grouped[a.anomaly_type] || [];
    grouped[a.anomaly_type].push(a);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
        <AlertTriangle className="w-4 h-4" />
        预检发现 {anomalies.length} 个异常，请处理后再计算
      </div>

      {Object.entries(grouped).map(([type, items]) => {
        const info = ANOMALY_LABELS[type] || { label: `异常${type}`, icon: "⚠️" };
        return (
          <div key={type} className="border rounded-lg overflow-hidden">
            <div className="bg-zinc-50 px-4 py-2 text-sm font-medium flex items-center gap-2">
              <span>{info.icon}</span>
              <span>{info.label}</span>
              <span className="text-zinc-400 font-normal">({items.length})</span>
            </div>
            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm">{item.description}</p>
                    {item.entity_id && (
                      <p className="text-xs text-zinc-400 mt-0.5">ID: {item.entity_id}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleIgnore(item.id)}>
                      <XCircle className="w-3 h-3 mr-1" />
                      忽略
                    </Button>
                    <Button size="sm" onClick={() => handleResolve(item.id)}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      处理
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
