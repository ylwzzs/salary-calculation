import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Breakdown {
  person: string;
  store: string;
  sales: number;
  target: number;
  achievement: number;
  bucket: string;
  commission: number;
}

interface ResultTableProps {
  month: string;
  data: {
    salary: { person: string; commission: number }[];
    breakdown: Breakdown[];
  };
}

interface RowSummary {
  person: string;
  store: string;
  storeClass: string;
  target: number;
  dailyTarget: number;
  days: number;
  actualTarget: number;
  sales: number;
  achievement: number;
  commission: number;
}

export default function ResultTable({ month, data }: ResultTableProps) {
  const [expanded, setExpanded] = useState<{
    type: "attendance" | "commission";
    person: string;
    store: string;
  } | null>(null);

  // 生成汇总行
  const rows = useMemo(() => {
    const map = new Map<string, Breakdown[]>();
    data.breakdown.forEach((r) => {
      const key = `${r.person}|${r.store}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });

    const result: RowSummary[] = [];
    map.forEach((items, key) => {
      const first = items[0];
      const dailyTarget = first.target / 30;
      result.push({
        person: first.person,
        store: first.store,
        storeClass: "A",
        target: first.target,
        dailyTarget,
        days: Math.round(first.achievement * 30),
        actualTarget: dailyTarget * Math.round(first.achievement * 30),
        sales: first.sales,
        achievement: first.achievement,
        commission: items.reduce((s, i) => s + i.commission, 0),
      });
    });
    return result;
  }, [data]);

  // 人员名合并单元格
  const personRows = useMemo(() => {
    const map = new Map<string, RowSummary[]>();
    rows.forEach((r) => {
      if (!map.has(r.person)) map.set(r.person, []);
      map.get(r.person)!.push(r);
    });
    return Array.from(map.entries());
  }, [rows]);

  const toggleExpand = (type: "attendance" | "commission", person: string, store: string) => {
    if (expanded?.type === type && expanded.person === person && expanded.store === store) {
      setExpanded(null);
    } else {
      setExpanded({ type, person, store });
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[70px]">员工姓名</TableHead>
            <TableHead>门店</TableHead>
            <TableHead>门店类型</TableHead>
            <TableHead>目标</TableHead>
            <TableHead>日目标</TableHead>
            <TableHead className="bg-blue-50">考勤天数</TableHead>
            <TableHead>实际目标</TableHead>
            <TableHead>销售额</TableHead>
            <TableHead>达标率</TableHead>
            <TableHead className="bg-orange-50">提成金额</TableHead>
            <TableHead>汇总</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {personRows.map(([person, stores]) =>
            stores.map((row, index) => (
              <TableRow key={`${person}-${row.store}`}>
                {index === 0 && (
                  <TableCell
                    rowSpan={stores.length}
                    className="font-medium bg-zinc-50/50"
                  >
                    {person}
                  </TableCell>
                )}
                <TableCell>{row.store}</TableCell>
                <TableCell>{row.storeClass}</TableCell>
                <TableCell className="tnum">¥{row.target.toFixed(0)}</TableCell>
                <TableCell className="tnum">¥{row.dailyTarget.toFixed(0)}</TableCell>
                <TableCell
                  className="bg-blue-50 tnum cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => toggleExpand("attendance", person, row.store)}
                >
                  {row.days}天{" "}
                  {expanded?.type === "attendance" &&
                  expanded.person === person &&
                  expanded.store === row.store
                    ? "▲"
                    : "▼"}
                </TableCell>
                <TableCell className="tnum">¥{row.actualTarget.toFixed(0)}</TableCell>
                <TableCell className="tnum">¥{row.sales.toFixed(0)}</TableCell>
                <TableCell className="tnum">{(row.achievement * 100).toFixed(0)}%</TableCell>
                <TableCell
                  className="bg-orange-50 tnum cursor-pointer hover:bg-orange-100 transition-colors"
                  onClick={() => toggleExpand("commission", person, row.store)}
                >
                  ¥{row.commission.toFixed(0)}{" "}
                  {expanded?.type === "commission" &&
                  expanded.person === person &&
                  expanded.store === row.store
                    ? "▲"
                    : "▼"}
                </TableCell>
                <TableCell className="tnum font-semibold">¥{row.commission.toFixed(0)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t bg-zinc-50 p-4">
          {expanded.type === "attendance" ? (
            <AttendanceDetail month={month} person={expanded.person} store={expanded.store} />
          ) : (
            <CommissionDetail month={month} person={expanded.person} store={expanded.store} />
          )}
        </div>
      )}
    </div>
  );
}

function AttendanceDetail({ month, person, store }: { month: string; person: string; store: string }) {
  // 示例日期数据
  const dates = [
    { day: 1, sales: 3200 },
    { day: 3, sales: 2800 },
    { day: 10, sales: 4500 },
    { day: 20, sales: 3100 },
    { day: 28, sales: 1600 },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-500">
        {person} @ {store} 考勤明细
      </p>
      <div className="flex gap-2 flex-wrap">
        {dates.map((d) => (
          <button
            key={d.day}
            className="bg-white border border-blue-200 rounded-md px-3 py-1.5 text-sm hover:bg-blue-50 transition-colors cursor-pointer"
            title="点击查看交易明细"
          >
            <span className="font-medium">{d.day}号</span>
            <span className="text-zinc-500 ml-2">¥{d.sales.toFixed(0)}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-400">点击日期查看当天交易明细</p>
    </div>
  );
}

function CommissionDetail({ month, person, store }: { month: string; person: string; store: string }) {
  // 示例数据：提成明细按商品档位分类，含标签
  const tiers: { name: string; sales: number; rate: string; commission: number; tag?: { label: string; icon: string; color: string } }[] = [
    { name: "常温高毛", sales: 6500, rate: "12%", commission: 780 },
    { name: "常温低毛", sales: 3200, rate: "7%", commission: 224 },
    { name: "低温高毛", sales: 4000, rate: "13%", commission: 520 },
    { name: "低温低毛", sales: 1200, rate: "9%", commission: 108 },
    { name: "特价", sales: 300, rate: "1%", commission: 3, tag: { label: "赠送", icon: "🎁", color: "bg-blue-50 text-blue-700 border-blue-200" } },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-500">
        {person} @ {store} 提成明细
      </p>
      <Table className="bg-white rounded-lg">
        <TableHeader>
          <TableRow>
            <TableHead>商品档位</TableHead>
            <TableHead className="text-right">销售额</TableHead>
            <TableHead className="text-right">提成比例</TableHead>
            <TableHead className="text-right">提成金额</TableHead>
            <TableHead className="w-20">标签</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((t) => (
            <TableRow key={t.name}>
              <TableCell>
                <button
                  className="text-blue-600 hover:underline cursor-pointer"
                  title="点击查看商品明细"
                >
                  {t.name}
                </button>
              </TableCell>
              <TableCell className="text-right tnum">¥{t.sales.toFixed(0)}</TableCell>
              <TableCell className="text-right">{t.rate}</TableCell>
              <TableCell className="text-right tnum font-medium">¥{t.commission.toFixed(0)}</TableCell>
              <TableCell>
                {t.tag && (
                  <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded ${t.tag.color}`}>
                    {t.tag.icon} {t.tag.label}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-zinc-400">
        点击商品档位查看相关商品明细　
        <span className="text-blue-500">🎁 赠送</span> · <span className="text-red-500">↩️ 退款</span> · <span className="text-amber-500">🔄 调整</span>
      </p>
    </div>
  );
}
