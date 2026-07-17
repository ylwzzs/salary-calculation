import { useEffect, useMemo, useState } from "react";
import { storesApi, type Store } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit3, Tag, X, CheckSquare, Square, Trash2 } from "lucide-react";
import { Block, BlockTitle, BlockDescription } from "@/components/Block";
import { toast } from "sonner";

const CLASSES = ["A", "B", "C", "D"];

export default function Stores() {
  const [rows, setRows] = useState<Store[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Store | null>(null);
  const [form, setForm] = useState<Partial<Store>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => { try { setRows(await storesApi.list()); } catch { /* ignore */ } };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      r.name?.toLowerCase().includes(q) ||
      r.group?.toLowerCase().includes(q) ||
      r.store_class?.toLowerCase().includes(q) ||
      r.supervisor?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.name));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.name)));
  };
  const toggle = (name: string) => {
    setSelected((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const batchSet = async (exclude: boolean) => {
    const items = Array.from(selected);
    toast.info(`正在标记 ${items.length} 个门店...`);
    try {
      for (const name of items) {
        const s = rows.find((r) => r.name === name);
        if (s) await storesApi.upsert({ ...s, exclude_assessment: exclude });
      }
      toast.success(`已${exclude ? "标记" : "取消"} ${items.length} 个门店`);
      setSelected(new Set()); load();
    } catch { toast.error("批量操作失败"); }
  };

  const batchDelete = async () => {
    const items = Array.from(selected);
    if (!confirm(`确定删除 ${items.length} 个门店？此操作不可撤销。`)) return;
    try {
      for (const name of items) {
        await storesApi.remove(name);
      }
      toast.success(`已删除 ${items.length} 个门店`);
      setSelected(new Set()); load();
    } catch { toast.error("删除失败"); }
  };

  const save = async () => {
    if (!form.name) { toast.error("门店名不能为空"); return; }
    await storesApi.upsert({ ...form, exclude_assessment: form.exclude_assessment ?? false } as Store);
    toast.success("已保存"); setOpen(false); setEdit(null); load();
  };
  const openEdit = (s?: Store) => { setEdit(s ?? null); setForm(s ?? { store_class: "A" }); setOpen(true); };

  return (
    <div className="space-y-5 max-w-4xl">
      <Block>
        <div className="flex items-center justify-between">
          <div>
            <BlockTitle>门店信息 <Badge variant="secondary" className="ml-1">{rows.length}</Badge></BlockTitle>
            <BlockDescription>门店档案与类别，用于达成率计算</BlockDescription>
          </div>
          <Button size="sm" onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" />新增</Button>
        </div>
      </Block>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
          <CheckSquare className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">已选 {selected.size} 项</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => batchSet(true)}>
            <Tag className="w-3.5 h-3.5 mr-1" />标记不计考核
          </Button>
          <Button size="sm" variant="outline" onClick={() => batchSet(false)}>
            取消标记
          </Button>
          <Button size="sm" variant="ghost" onClick={batchDelete}>
            <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />删除
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {rows.length > 0 ? (
        <Block>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input placeholder="搜索门店、组别、类别、主管..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10">
                  <button onClick={toggleAll} className="p-0.5">
                    {allChecked ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
                  </button>
                </TableHead>
                <TableHead>门店</TableHead><TableHead>组别</TableHead><TableHead>类别</TableHead>
                <TableHead>考核标记</TableHead><TableHead>主管</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.name} className="cursor-pointer" onClick={() => openEdit(r)}>
                    <TableCell>
                      <button onClick={(e) => { e.stopPropagation(); toggle(r.name); }}
                        className="p-0.5">
                        {selected.has(r.name)
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4 text-zinc-300" />}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-zinc-500">{r.group || <span className="text-zinc-300">—</span>}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[11px] font-normal">{r.store_class ? `${r.store_class}类` : <span className="text-zinc-300">—</span>}</Badge></TableCell>
                    <TableCell>
                      {r.exclude_assessment
                        ? <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">不计考核</Badge>
                        : <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">参与考核</Badge>}
                    </TableCell>
                    <TableCell className="text-zinc-500">{r.supervisor || <span className="text-zinc-300">—</span>}</TableCell>
                    <TableCell className="text-right">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                        className="p-1.5 rounded-md border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-colors">
                        <Edit3 className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length === 0 && search && (
              <p className="text-sm text-zinc-400 text-center py-6">没有匹配「{search}」的门店</p>
            )}
          </div>
        </Block>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-sm">暂无门店数据，点击上方「新增」添加门店</div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{edit ? "编辑门店" : "新增门店"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-[13px] text-zinc-500">门店名称</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!!edit} className="mt-1 h-9" /></div>
            <div><Label className="text-[13px] text-zinc-500">组别</Label><Input value={form.group ?? ""} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="如 1组" className="mt-1 h-9" /></div>
            <div><Label className="text-[13px] text-zinc-500">类别</Label><Select value={form.store_class ?? ""} onValueChange={(v) => setForm({ ...form, store_class: v })}><SelectTrigger className="mt-1 h-9"><SelectValue placeholder="选择" /></SelectTrigger><SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}类</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-[13px] text-zinc-500">主管</Label><Input value={form.supervisor ?? ""} onChange={(e) => setForm({ ...form, supervisor: e.target.value })} className="mt-1 h-9" /></div>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="exclude" checked={form.exclude_assessment ?? false}
                onChange={(e) => setForm({ ...form, exclude_assessment: e.target.checked })} className="rounded border-zinc-300" />
              <Label htmlFor="exclude" className="text-[13px] text-zinc-500 cursor-pointer">不参与考核</Label>
            </div>
          </div>
          <DialogFooter><Button onClick={save}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}