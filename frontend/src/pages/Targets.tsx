import { useEffect, useState } from "react";
import { targetsApi, type Target } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RefreshCw, Calendar, CheckSquare, Square, X } from "lucide-react";
import { Block, BlockTitle, BlockDescription } from "@/components/Block";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Targets() {
  const [rows, setRows] = useState<Target[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [months, setMonths] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const data = await targetsApi.list(selectedMonth || undefined);
      setRows(data);

      // 提取所有月份
      const uniqueMonths = Array.from(new Set(data.map(t => t.month))).sort().reverse();
      setMonths(uniqueMonths);
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedMonth]);

  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };
  const toggle = (id: number) => {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleBatchCreate = async () => {
    if (!selectedMonth) {
      toast.error("请先选择月份");
      return;
    }

    try {
      const result = await targetsApi.batchCreate(selectedMonth);
      toast.success(`已创建 ${result.created} 条目标`);
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      toast.error(error.response?.data?.detail || "创建失败");
    }
  };

  const handleDeleteSelected = async () => {
    const items = Array.from(selected);
    if (!confirm(`确定删除 ${items.length} 条目标？`)) return;

    try {
      for (const id of items) {
        await targetsApi.delete(id);
      }
      toast.success(`已删除 ${items.length} 条目标`);
      setSelected(new Set());
      load();
    } catch {
      toast.error("删除失败");
    }
  };

  const handleDeleteMonth = async () => {
    if (!selectedMonth) {
      toast.error("请先选择月份");
      return;
    }

    if (!confirm(`确定删除 ${selectedMonth} 的所有目标？`)) return;

    try {
      const result = await targetsApi.deleteMonth(selectedMonth);
      toast.success(`已删除 ${result.deleted} 条目标`);
      setSelected(new Set());
      load();
    } catch {
      toast.error("删除失败");
    }
  };

  const updateTarget = async (id: number, value: number) => {
    try {
      await targetsApi.update(id, value);
      load();
    } catch {
      toast.error("更新失败");
    }
  };

  const totalTarget = rows.reduce((sum, r) => sum + r.target, 0);

  return (
    <div className="space-y-5 max-w-4xl">
      <Block>
        <div className="flex items-center justify-between">
          <div>
            <BlockTitle>月度目标管理 <Badge variant="secondary" className="ml-1">{rows.length}</Badge></BlockTitle>
            <BlockDescription>配置各门店月度销售目标，用于达成率计算</BlockDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[140px] h-9">
                <Calendar className="w-4 h-4 mr-1.5" />
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                {months.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Block>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
          <CheckSquare className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">已选 {selected.size} 项</span>
          <Button size="sm" variant="ghost" onClick={handleDeleteSelected} className="ml-auto">
            <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />删除
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      <Block>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleBatchCreate} disabled={!selectedMonth}>
              <Plus className="w-4 h-4 mr-1.5" />批量创建
            </Button>
            <Button size="sm" variant="outline" onClick={handleDeleteMonth} disabled={!selectedMonth}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />清空月份
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">目标合计：</span>
            <span className="font-semibold text-zinc-900 tnum">¥{totalTarget.toLocaleString()}</span>
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <button onClick={toggleAll} className="p-0.5">
                      {allChecked ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
                    </button>
                  </TableHead>
                  <TableHead>月份</TableHead>
                  <TableHead>门店</TableHead>
                  <TableHead className="text-right">月度目标</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <button onClick={() => toggle(r.id)} className="p-0.5">
                        {selected.has(r.id)
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4 text-zinc-300" />}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-normal">{r.month}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.store}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={r.target}
                        onChange={e => updateTarget(r.id, Number(e.target.value))}
                        className="w-28 h-8 text-right font-mono text-[13px]"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-sm">
            {selectedMonth ? `暂无 ${selectedMonth} 的目标数据` : "请选择月份查看目标"}
          </div>
        )}
      </Block>
    </div>
  );
}