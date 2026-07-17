import { useState } from "react";
import { workflowApi } from "../../api";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload } from "lucide-react";

function DropZone({ label, onUpload, done, loading }: { label: string; onUpload: (f: File) => void; done: boolean; loading?: boolean }) {
  return (
    <div className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors cursor-pointer ${done ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 hover:border-zinc-300 bg-white"}`}>
      <label className="cursor-pointer flex flex-col items-center gap-2">
        <Upload className={`w-5 h-5 ${done ? "text-emerald-500" : loading ? "text-blue-500 animate-pulse" : "text-zinc-400"}`} />
        <span className="text-sm text-zinc-500">
          {loading ? "上传中..." : label}
          {done && !loading && <Badge className="ml-1 bg-emerald-100 text-emerald-700 border-emerald-200">已上传</Badge>}
        </span>
        <input type="file" accept=".xlsx,.xls" className="sr-only" disabled={loading} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
      </label>
    </div>
  );
}

export default function ImportStep({ month }: { month: string }) {
  const [sales, setSales] = useState(false);
  const [gifts, setGifts] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const upload = (kind: "sales" | "gifts", file: File) => {
    setUploading(kind);
    (kind === "sales" ? workflowApi.importSales : workflowApi.importGifts)(month, file)
      .then(() => {
        kind === "sales" ? setSales(true) : setGifts(true);
        toast.success(`${kind === "sales" ? "销售流水" : "让利明细"}上传成功`);
      })
      .catch(() => toast.error("上传失败，请检查文件格式"))
      .finally(() => setUploading(null));
  };

  return (
    <div className="space-y-3 max-w-xl">
      <DropZone label="上传销售流水 xlsx" onUpload={(f) => upload("sales", f)} done={sales} loading={uploading === "sales"} />
      <DropZone label="上传让利明细 xlsx（赠送清单，可选）" onUpload={(f) => upload("gifts", f)} done={gifts} loading={uploading === "gifts"} />
    </div>
  );
}
