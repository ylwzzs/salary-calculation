import { useEffect, useState } from "react";
import { targetsApi, storesApi, monthStepApi } from "../../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface Row {
  store: string;
  target: number;
}

export default function TargetsStep({ month }: { month: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openNewStore, setOpenNewStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreGroup, setNewStoreGroup] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await targetsApi.get(month);
      const items = Object.values(data)[0] || {};
      setRows(
        Object.entries(items).map(([store, target]) => ({
          store,
          target: Number(target),
        }))
      );
    } catch {
      toast.error("加载目标失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await targetsApi.batchSet(
        month,
        rows.map((r) => ({ store: r.store, target: String(r.target) }))
      );
      await monthStepApi.update(month, "targets", { targets: true }).catch(() => {});
      toast.success("目标已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStore = async () => {
    if (!newStoreName) {
      toast.error("请输入门店名称");
      return;
    }
    try {
      await storesApi.upsert({ name: newStoreName, group: newStoreGroup || undefined } as any);
      toast.success("门店已创建");
      setOpenNewStore(false);
      setNewStoreName("");
      setNewStoreGroup("");
      // 刷新列表
      load();
    } catch {
      toast.error("创建门店失败");
    }
  };

  const total = rows.reduce((s, r) => s + r.target, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!loading && rows.length > 0 && (
            <span className="text-sm text-zinc-500">
              目标总额：<strong className="text-zinc-800">¥{total.toLocaleString()}</strong>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpenNewStore(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            新增门店
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "保存中..." : "保存目标"}
          </Button>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-zinc-400">加载中...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-sm">
          暂无门店数据，请先在门店信息页添加门店，或点击「新增门店」
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>门店</TableHead>
                <TableHead className="text-right w-40">月度目标</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.store}>
                  <TableCell>{r.store}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={r.target}
                      onChange={(e) => {
                        r.target = Number(e.target.value || 0);
                        setRows([...rows]);
                      }}
                      className="w-28 h-8 text-right font-mono text-[13px]"
                      min={0}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 新建门店弹窗 */}
      <Dialog open={openNewStore} onOpenChange={setOpenNewStore}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新建门店</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-[13px]">门店名称</Label>
              <Input
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="输入门店名称"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-[13px]">所属组（可选）</Label>
              <Input
                value={newStoreGroup}
                onChange={(e) => setNewStoreGroup(e.target.value)}
                placeholder="如：1组、2组"
                className="mt-1 h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateStore}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
