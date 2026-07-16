import { useEffect, useState } from "react";
import { storesApi, type Store } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const CLASSES = ["A", "B", "C", "D"];

export default function Stores() {
  const [rows, setRows] = useState<Store[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Store | null>(null);
  const [form, setForm] = useState<Partial<Store>>({});
  const [batchGroup, setBatchGroup] = useState("");
  const [batchClass, setBatchClass] = useState("A");

  const load = async () => { try { setRows(await storesApi.list()); } catch { /* ignore */ } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) { toast.error("门店名不能为空"); return; }
    await storesApi.upsert(form as Store);
    toast.success("已保存"); setOpen(false); setEdit(null); load();
  };
  const openEdit = (s?: Store) => { setEdit(s ?? null); setForm(s ?? {}); setOpen(true); };
  const onBatch = async () => {
    if (!batchGroup) { toast.warning("请输入组别"); return; }
    const { updated } = await storesApi.batchClass(batchGroup, batchClass);
    toast.success(`已更新 ${updated} 家门店`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">门店信息 <Badge variant="secondary">{rows.length}</Badge></h2>
        <div className="flex items-center gap-2">
          <Input placeholder="组别，如 1组" value={batchGroup} onChange={(e) => setBatchGroup(e.target.value)} className="w-28 h-9" />
          <Select value={batchClass} onValueChange={setBatchClass}><SelectTrigger className="w-20 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}类</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onBatch}>批量改类别</Button>
          <Button size="sm" onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1.5" />新增</Button>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>门店</TableHead><TableHead>组别</TableHead><TableHead>类别</TableHead>
            <TableHead>主管</TableHead><TableHead className="w-16"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name} className="cursor-pointer hover:bg-zinc-50" onClick={() => openEdit(r)}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-zinc-500">{r.group}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{r.store_class}</Badge></TableCell>
                <TableCell className="text-zinc-500">{r.supervisor}</TableCell>
                <TableCell><button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-xs text-zinc-400 hover:text-zinc-700">编辑</button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{edit ? "编辑门店" : "新增门店"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-[13px]">门店名称</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!!edit} className="mt-1 h-9" /></div>
            <div><Label className="text-[13px]">组别</Label><Input value={form.group ?? ""} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="如 1组" className="mt-1 h-9" /></div>
            <div><Label className="text-[13px]">类别</Label><Select value={form.store_class ?? ""} onValueChange={(v) => setForm({ ...form, store_class: v })}><SelectTrigger className="mt-1 h-9"><SelectValue placeholder="选择" /></SelectTrigger><SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-[13px]">主管</Label><Input value={form.supervisor ?? ""} onChange={(e) => setForm({ ...form, supervisor: e.target.value })} className="mt-1 h-9" /></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-zinc-900 hover:bg-zinc-800">保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
