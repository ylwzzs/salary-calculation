import { useEffect, useMemo, useState } from "react";
import { workflowApi, dutyTransferApi, type DutyGrid as DutyGridType } from "../../api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function DutyStep({ month }: { month: string }) {
  const [grid, setGrid] = useState<DutyGridType>({});
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});

  const infer = async () => {
    setLoading(true);
    try {
      setGrid(await workflowApi.inferDuty(month));
      setEdit({});
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    infer();
  }, []);

  const dates = useMemo(() => {
    const s = new Set<string>();
    Object.values(grid).forEach((d) => Object.keys(d).forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [grid]);

  const cell = (store: string, date: string): string => {
    const k = `${store}|${date}`;
    if (k in edit) return edit[k];
    const v = grid[store]?.[date];
    return typeof v === "string" ? v : "";
  };

  const multiCount = Object.values(grid).reduce(
    (n, d) => n + Object.values(d).filter((v) => Array.isArray(v)).length,
    0
  );

  const confirm = async () => {
    const items: { store: string; date: string; salesperson: string }[] = [];
    for (const store of Object.keys(grid)) {
      for (const date of Object.keys(grid[store])) {
        const p = cell(store, date);
        if (p) items.push({ store, date, salesperson: p });
      }
    }
    setConfirming(true);
    try {
      await workflowApi.setDuty(month, items);
      toast.success(`已确认 ${items.length} 条当班`);
    } catch {
      toast.error("确认失败");
    } finally {
      setConfirming(false);
    }
  };

  const handleSelect = (store: string, date: string, val: string) => {
    setEdit((e) => ({ ...e, [`${store}|${date}`]: val }));
  };

  const handleDrop = async (
    fromStore: string,
    toStore: string,
    date: string,
    person: string
  ) => {
    if (fromStore === toStore) return;
    try {
      await dutyTransferApi.transfer(month, fromStore, toStore, date, person);
      toast.success(`${person} 从 ${fromStore} 转移到 ${toStore}`);
      await infer();
    } catch {
      toast.error("转移失败");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={infer} disabled={loading}>
          {loading ? "推断中..." : "重新推断"}
        </Button>
        {multiCount > 0 ? (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            {multiCount} 个多人当天
          </Badge>
        ) : (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
            无冲突
          </Badge>
        )}
        <Button
          size="sm"
          onClick={confirm}
          disabled={confirming}
          className="ml-auto"
        >
          {confirming ? "确认中..." : "确认当班"}
        </Button>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/50">
              <th className="text-left px-3 py-2.5 font-medium text-zinc-500 sticky left-0 bg-zinc-50/50 z-10 min-w-[100px]">
                门店
              </th>
              {dates.map((d) => (
                <th
                  key={d}
                  className="text-center px-2 py-2.5 font-medium text-zinc-500 whitespace-nowrap min-w-[60px]"
                >
                  {d.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(grid).map((store) => (
              <tr key={store} className="border-b border-zinc-100 last:border-0">
                <td className="px-3 py-2 font-medium text-zinc-700 sticky left-0 bg-white z-10">
                  {store}
                </td>
                {dates.map((date) => {
                  const v = grid[store]?.[date];
                  const k = `${store}|${date}`;
                  const cur = cell(store, date);
                  return (
                    <td
                      key={date}
                      className={`text-center px-2 py-1.5 ${
                        Array.isArray(v) ? "bg-red-50" : ""
                      }`}
                      onDragOver={(e) => {
                        if (cur) {
                          e.preventDefault();
                          e.currentTarget.style.background = "#dbeafe";
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.style.background = Array.isArray(v)
                          ? "#fef2f2"
                          : "";
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.currentTarget.style.background = "";
                        const data = e.dataTransfer.getData("text/plain");
                        if (data && cur && !Array.isArray(v)) {
                          const parsed = JSON.parse(data);
                          await handleDrop(
                            parsed.store,
                            store,
                            date,
                            parsed.person
                          );
                        }
                      }}
                    >
                      {Array.isArray(v) ? (
                        <Select
                          value={cur || ""}
                          onValueChange={(val) =>
                            handleSelect(store, date, val)
                          }
                        >
                          <SelectTrigger className="h-7 w-20 text-xs border-red-300 mx-auto bg-red-50">
                            <SelectValue placeholder="选择" />
                          </SelectTrigger>
                          <SelectContent>
                            {(v as string[]).map((p) => (
                              <SelectItem key={p} value={p} className="text-xs">
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : cur ? (
                        <span
                          className="text-sm text-zinc-700 cursor-grab inline-block px-1 py-0.5 rounded hover:bg-blue-50"
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData(
                              "text/plain",
                              JSON.stringify({ store, person: cur })
                            )
                          }
                        >
                          {cur}
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {multiCount > 0 && (
        <p className="text-xs text-zinc-400">
          💡 红色背景为多人冲突，请为每位冲突选择保留的人员。
          <br />
          💡 拖拽人员名字到其他门店的空单元格可将该人员转移过去。
        </p>
      )}
    </div>
  );
}
