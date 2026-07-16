import { useEffect, useState } from "react";
import { productsApi, type Product } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function Products() {
  const [rows, setRows] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<Product>>({});

  const load = async () => { try { setRows(await productsApi.list()); } catch { /* ignore */ } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.barcode) { toast.error("条码不能为空"); return; }
    await productsApi.upsert(form as Product);
    toast.success("已保存"); setOpen(false); setEdit(null); load();
  };
  const openEdit = (p?: Product) => { setEdit(p ?? null); setForm(p ?? { category: "低温奶" }); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">商品档案 <Badge variant="secondary">{rows.length}</Badge></h2>
        <Button size="sm" onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1.5" />新增</Button>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>条码</TableHead><TableHead>名称</TableHead><TableHead>规格</TableHead>
            <TableHead>分类</TableHead><TableHead className="text-right">成本</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.barcode} className="cursor-pointer hover:bg-zinc-50" onClick={() => openEdit(r)}>
                <TableCell className="font-mono text-xs">{r.barcode}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-zinc-500">{r.spec}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{r.category}</Badge></TableCell>
                <TableCell className="text-right font-mono tnum">{r.cost != null ? `¥${r.cost}` : "—"}</TableCell>
                <TableCell><button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-xs text-zinc-400 hover:text-zinc-700">编辑</button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{edit ? "编辑商品" : "新增商品"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-[13px]">条码</Label><Input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} disabled={!!edit} className="mt-1 h-9" /></div>
            <div><Label className="text-[13px]">名称</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-9" /></div>
            <div><Label className="text-[13px]">规格</Label><Input value={form.spec ?? ""} onChange={(e) => setForm({ ...form, spec: e.target.value })} className="mt-1 h-9" /></div>
            <div><Label className="text-[13px]">分类</Label><Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 h-9" placeholder="常温奶 / 低温奶" /></div>
            <div><Label className="text-[13px]">销售成本</Label><Input type="number" value={form.cost ?? ""} onChange={(e) => setForm({ ...form, cost: e.target.value ? Number(e.target.value) : null })} className="mt-1 h-9" /></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-zinc-900 hover:bg-zinc-800">保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
