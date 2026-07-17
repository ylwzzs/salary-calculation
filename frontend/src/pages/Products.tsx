import { useEffect, useState } from "react";
import { productsApi, type Product } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit3 } from "lucide-react";
import { Block, BlockTitle, BlockDescription, Callout } from "@/components/Block";
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
    <div className="space-y-5 max-w-4xl">
      <Block>
        <div className="flex items-center justify-between mb-3">
          <div>
            <BlockTitle>商品档案 <Badge variant="secondary" className="ml-1">{rows.length}</Badge></BlockTitle>
            <BlockDescription>乳品主数据与销售成本，用于毛利率分档</BlockDescription>
          </div>
          <Button size="sm" onClick={() => openEdit()} className="">
            <Plus className="w-4 h-4 mr-1" />新增
          </Button>
        </div>
        {rows.length > 0 ? (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>条码</TableHead><TableHead>名称</TableHead><TableHead>规格</TableHead>
                <TableHead>分类</TableHead><TableHead className="text-right">成本</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.barcode} className="cursor-pointer" onClick={() => openEdit(r)}>
                    <TableCell className="font-mono text-xs text-zinc-500">{r.barcode}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-zinc-500">{r.spec}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[11px] font-normal">{r.category}</Badge></TableCell>
                    <TableCell className="text-right tnum">{r.cost != null ? `¥${r.cost}` : "—"}</TableCell>
                    <TableCell>
                      <button onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 transition-opacity">
                        <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Callout variant="default">暂无商品数据，点击「新增」添加乳品档案</Callout>
        )}
      </Block>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{edit ? "编辑商品" : "新增商品"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-[13px] text-zinc-500">条码</Label><Input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} disabled={!!edit} className="mt-1 h-9" /></div>
            <div><Label className="text-[13px] text-zinc-500">名称</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-9" /></div>
            <div><Label className="text-[13px] text-zinc-500">规格</Label><Input value={form.spec ?? ""} onChange={(e) => setForm({ ...form, spec: e.target.value })} className="mt-1 h-9" /></div>
            <div><Label className="text-[13px] text-zinc-500">分类</Label><Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 h-9" placeholder="常温奶 / 低温奶" /></div>
            <div><Label className="text-[13px] text-zinc-500">销售成本</Label><Input type="number" value={form.cost ?? ""} onChange={(e) => setForm({ ...form, cost: e.target.value ? Number(e.target.value) : null })} className="mt-1 h-9" /></div>
          </div>
          <DialogFooter><Button onClick={save} className="">保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
