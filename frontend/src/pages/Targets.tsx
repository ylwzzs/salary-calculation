import { useEffect, useState } from "react";
import { targetsApi, storesApi, monthsApi, type Target, type Store, type MonthInfo } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Save, X, FileText } from "lucide-react";
import { Block, BlockTitle, BlockDescription } from "@/components/Block";
import { toast } from "sonner";

interface TargetRow {
  store: string;
  group: string;
  store_class: string;
  target: number;
  exists: boolean;
  id?: number;
}

export default function Targets() {
  const [months, setMonths] = useState<MonthInfo[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newMonth, setNewMonth] = useState("");

  // 加载所有月份
  const loadMonths = async () => {
    try {
      const data = await monthsApi.list();
      setMonths(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadMonths();
  }, []);

  // 加载某月份的目标数据
  const loadMonthData = async (month: string) => {
    if (!month) return;

    setLoading(true);
    try {
      // 获取所有参与考核的门店
      const stores = await storesApi.list();
      const activeStores = stores.filter(s => !s.exclude_assessment);

      // 获取该月份已有的目标
      const targets = await targetsApi.list(month);

      // 合并：门店列表 + 目标值
      const targetMap = new Map(targets.map(t => [t.store, t]));
      const targetRows = activeStores.map(store => ({
        store: store.name,
        group: store.group || "-",
        store_class: store.store_class || "-",
        target: targetMap.get(store.name)?.target || 0,
        exists: targetMap.has(store.name),
        id: targetMap.get(store.name)?.id
      }));

      setRows(targetRows.sort((a, b) => a.store.localeCompare(b.store)));
    } catch {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 选择月份
  useEffect(() => {
    if (selectedMonth && !editMode) {
      loadMonthData(selectedMonth);
    }
  }, [selectedMonth]);

  // 新建月份
  const handleCreateMonth = async () => {
    if (!newMonth.match(/^\d{4}-\d{2}$/)) {
      toast.error("格式应为 YYYY-MM");
      return;
    }

    try {
      await monthsApi.create(newMonth);
      toast.success(`已创建 ${newMonth}`);
      setCreateOpen(false);
      setNewMonth("");
      loadMonths();
      setSelectedMonth(newMonth);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      const message = error.response?.data?.detail || "创建失败";
      toast.error(message);
    }
  };

  // 新建目标（进入编辑模式）
  const handleCreate = () => {
    setEditMode(true);
    loadMonthData(selectedMonth);
  };

  // 保存目标
  const handleSave = async () => {
    if (!selectedMonth) {
      toast.error("请先选择月份");
      return;
    }

    setSaving(true);
    try {
      // 批量保存
      const items = rows.map(r => ({ store: r.store, target: String(r.target) }));
      await targetsApi.batchSet(selectedMonth, items);
      toast.success(`已保存 ${rows.length} 个门店目标`);
      setEditMode(false);
      loadMonths();
      loadMonthData(selectedMonth);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 取消编辑
  const handleCancel = () => {
    setEditMode(false);
    if (selectedMonth) {
      loadMonthData(selectedMonth);
    }
  };

  // 更新目标值
  const updateTarget = (store: string, value: number) => {
    setRows(rows.map(r =>
      r.store === store ? { ...r, target: value } : r
    ));
  };

  const totalTarget = rows.reduce((sum, r) => sum + r.target, 0);

  return (
    <div className="space-y-5 max-w-4xl">
      <Block>
        <div className="flex items-center justify-between">
          <div>
            <BlockTitle>月度目标管理 <Badge variant="secondary" className="ml-1">{months.length}</Badge></BlockTitle>
            <BlockDescription>配置各门店月度销售目标，用于达成率计算</BlockDescription>
          </div>
          <div className="flex items-center gap-2">
            {!editMode ? (
              <>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="h-9 px-3 rounded-md border border-zinc-200 text-sm"
                >
                  <option value="">选择月份</option>
                  {months.map(m => (
                    <option key={m.month} value={m.month}>{m.month}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                  <FileText className="w-4 h-4 mr-1.5" />新建月份
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={!selectedMonth}>
                  <Plus className="w-4 h-4 mr-1.5" />配置目标
                </Button>
              </>
            ) : (
              <>
                <Badge variant="outline" className="text-[13px]">
                  <Calendar className="w-3.5 h-3.5 mr-1" />
                  {selectedMonth}
                </Badge>
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  <X className="w-3.5 h-3.5 mr-1" />取消
                </Button>
              </>
            )}
          </div>
        </div>
      </Block>

      {loading ? (
        <div className="text-center py-12 text-zinc-400 text-sm">加载中...</div>
      ) : selectedMonth && rows.length > 0 ? (
        <Block>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-zinc-500">
              参与考核门店：{rows.length} 个
              {editMode && " · 填写目标值后点击保存"}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm">
                <span className="text-zinc-500">目标合计：</span>
                <span className="font-semibold text-zinc-900 tnum">¥{totalTarget.toLocaleString()}</span>
              </div>
              {editMode && (
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {saving ? "保存中..." : "保存"}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>门店</TableHead>
                  <TableHead className="w-20">组别</TableHead>
                  <TableHead className="w-20">类别</TableHead>
                  <TableHead className="text-right w-48">月度目标（元）</TableHead>
                  <TableHead className="w-20">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.store}>
                    <TableCell className="text-zinc-400">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.store}</TableCell>
                    <TableCell className="text-zinc-500">{r.group}</TableCell>
                    <TableCell className="text-zinc-500">{r.store_class}</TableCell>
                    <TableCell className="text-right">
                      {editMode ? (
                        <Input
                          type="number"
                          value={r.target}
                          onChange={e => updateTarget(r.store, Number(e.target.value))}
                          className="w-32 h-8 text-right font-mono text-[13px] ml-auto"
                          placeholder="0"
                        />
                      ) : (
                        <span className="tnum font-mono">{r.target.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.exists ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">已保存</Badge>
                      ) : (
                        <Badge className="bg-zinc-50 text-zinc-500 border-zinc-200 text-[10px]">待填写</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Block>
      ) : selectedMonth ? (
        <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-sm">
          该月份暂无目标数据，点击「配置目标」开始配置
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-sm">
          请选择月份或新建月份开始配置目标
        </div>
      )}

      {/* 新建月份弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>新建月份</DialogTitle></DialogHeader>
          <div className="py-3">
            <label className="text-sm text-zinc-500 mb-2 block">月份（YYYY-MM）</label>
            <Input
              value={newMonth}
              onChange={e => setNewMonth(e.target.value)}
              placeholder="例如：2026-08"
              className="h-9"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreateMonth}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}