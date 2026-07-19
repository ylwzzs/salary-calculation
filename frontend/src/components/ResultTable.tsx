import { useState, useMemo, useEffect, Fragment } from "react";
import { workflowApi, storesApi, type DutyGrid, type Store } from "../api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import RightDrawer from "./RightDrawer";

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

const TAG_STYLES: Record<string, { label: string; color: string }> = {
  "有效": { label: "有效", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "赠送": { label: "赠送", color: "bg-blue-50 text-blue-700 border-blue-200" },
  "退款": { label: "退款", color: "bg-red-50 text-red-700 border-red-200" },
  "不计提成": { label: "不计提成", color: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

interface SalesItem {
  id: number; receipt: string; src_order: string | null; store: string; sale_date: string;
  barcode: string; product_name: string; qty: number; amount: number; unit_price: number;
  salesperson: string; cashier: string; is_return: boolean; is_online: boolean; tag: string;
  original_store: string | null; original_date: string | null; transfer_reason: string | null;
}

export default function ResultTable({ month, data }: ResultTableProps) {
  const [expanded, setExpanded] = useState<{
    type: "attendance" | "commission";
    person: string;
    store: string;
  } | null>(null);
  const [dutyGrid, setDutyGrid] = useState<DutyGrid>({});
  const [storeMap, setStoreMap] = useState<Map<string, Store>>(new Map());
  const [drawer, setDrawer] = useState<{
    open: boolean;
    title: string;
    content: React.ReactNode;
  }>({ open: false, title: "", content: null });

  useEffect(() => {
    workflowApi.getDuty(month).then(setDutyGrid).catch(() => {});
    storesApi.list().then((stores) => {
      const map = new Map<string, Store>();
      stores.forEach((s) => map.set(s.name, s));
      setStoreMap(map);
    }).catch(() => {});
  }, [month]);

  const getPersonDates = (person: string, store: string): string[] => {
    const storeDuty = dutyGrid[store] || {};
    return Object.entries(storeDuty)
      .filter(([, p]) => p === person)
      .map(([d]) => d)
      .sort();
  };

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
      const personDates = getPersonDates(first.person, first.store);
      const days = personDates.length || Math.round(first.achievement * 30);
      const store = storeMap.get(first.store);
      result.push({
        person: first.person,
        store: first.store,
        storeClass: store?.store_class || "-",
        target: first.target,
        dailyTarget,
        days,
        actualTarget: dailyTarget * days,
        sales: first.sales,
        achievement: first.achievement,
        commission: items.reduce((s, i) => s + i.commission, 0),
      });
    });
    return result;
  }, [data, dutyGrid]);

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

  const handleDateClick = (person: string, store: string, date: string) => {
    setDrawer({
      open: true,
      title: `${person} @ ${store} - ${date} 销售明细`,
      content: <SalesDetailContent month={month} store={store} person={person} date={date} />,
    });
  };

  const handleTierClick = (person: string, store: string, tier: string) => {
    setDrawer({
      open: true,
      title: `${person} @ ${store} - ${tier} 商品明细`,
      content: <TierDetailContent month={month} store={store} person={person} bucket={tier} />,
    });
  };

  return (
    <>
      <div className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
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
            {personRows.map(([person, stores]) => {
              // 计算该员工的总行数（包括展开行）
              let expandedIndex = -1;
              if (expanded && expanded.person === person) {
                expandedIndex = stores.findIndex((r) => r.store === expanded.store);
              }
              const totalRows = stores.length + (expandedIndex >= 0 ? 1 : 0);

              return stores.map((row, index) => {
                const isExpanded =
                  expanded?.person === person && expanded.store === row.store;
                const showExpandedAfter = isExpanded;

                return (
                  <Fragment key={`${person}-${row.store}`}>
                    <TableRow>
                      {index === 0 && (
                        <TableCell
                          rowSpan={totalRows}
                          className="font-medium bg-zinc-50/50 align-top"
                        >
                          {person}
                        </TableCell>
                      )}
                      <TableCell>{row.store}</TableCell>
                      <TableCell>{row.storeClass}</TableCell>
                      <TableCell className="tnum">¥{row.target.toFixed(0)}</TableCell>
                      <TableCell className="tnum">¥{row.dailyTarget.toFixed(0)}</TableCell>
                      <TableCell
                        className={`bg-blue-50 tnum cursor-pointer hover:bg-blue-100 transition-colors ${
                          isExpanded && expanded?.type === "attendance" ? "bg-blue-200" : ""
                        }`}
                        onClick={() => toggleExpand("attendance", person, row.store)}
                      >
                        {row.days}天 {isExpanded && expanded?.type === "attendance" ? "▲" : "▼"}
                      </TableCell>
                      <TableCell className="tnum">¥{row.actualTarget.toFixed(0)}</TableCell>
                      <TableCell className="tnum">¥{row.sales.toFixed(0)}</TableCell>
                      <TableCell className="tnum">{(row.achievement * 100).toFixed(0)}%</TableCell>
                      <TableCell
                        className={`bg-orange-50 tnum cursor-pointer hover:bg-orange-100 transition-colors ${
                          isExpanded && expanded?.type === "commission" ? "bg-orange-200" : ""
                        }`}
                        onClick={() => toggleExpand("commission", person, row.store)}
                      >
                        ¥{row.commission.toFixed(0)} {isExpanded && expanded?.type === "commission" ? "▲" : "▼"}
                      </TableCell>
                      <TableCell className="tnum font-semibold">¥{row.commission.toFixed(0)}</TableCell>
                    </TableRow>
                    {/* 展开行 - 也纳入rowSpan组 */}
                    {showExpandedAfter && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-zinc-50 p-0">
                          <div className="px-6 py-4">
                            {expanded?.type === "attendance" ? (
                              <AttendanceDetail
                                person={person}
                                store={row.store}
                                dates={getPersonDates(person, row.store)}
                                onDateClick={(date) => handleDateClick(person, row.store, date)}
                              />
                            ) : (
                              <CommissionDetail
                                month={month}
                                person={person}
                                store={row.store}
                                onTierClick={(tier) => handleTierClick(person, row.store, tier)}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              });
            })}
          </TableBody>
        </Table>
      </div>

      <RightDrawer
        open={drawer.open}
        title={drawer.title}
        onClose={() => setDrawer({ ...drawer, open: false })}
      >
        {drawer.content}
      </RightDrawer>
    </>
  );
}

function AttendanceDetail({ person, store, dates, onDateClick }: { person: string; store: string; dates: string[]; onDateClick: (date: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-500">
        {person} @ {store} 考勤日期（{dates.length}天）
      </p>
      <div className="grid grid-cols-[repeat(31,1fr)] gap-px">
        {Array.from({ length: 31 }, (_, i) => {
          const day = String(i + 1).padStart(2, "0");
          const fullDate = dates.find((d) => d.slice(8) === day);
          const hasDate = !!fullDate;
          return (
            <span
              key={day}
              className={`text-center py-1 text-xs cursor-pointer transition-colors rounded-sm ${
                hasDate
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                  : "bg-zinc-50 text-zinc-300"
              }`}
              onClick={() => hasDate && onDateClick(fullDate!)}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CommissionDetail({ month, person, store, onTierClick }: { month: string; person: string; store: string; onTierClick: (tier: string) => void }) {
  const [tiers, setTiers] = useState<{ name: string; sales: number; qty: number; rate: number; rate_percent: string; commission: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSales, setTotalSales] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [bucket, setBucket] = useState("");
  const [target, setTarget] = useState(0);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [dutyDays, setDutyDays] = useState(0);

  useEffect(() => {
    workflowApi.getTierSummary(month, store, person)
      .then((r) => {
        setTiers(r.tiers);
        setTotalSales(r.total_sales);
        setTotalCommission(r.total_commission);
        setBucket(r.bucket);
        setTarget(r.target);
        setMonthlyTarget(r.monthly_target);
        setDutyDays(r.duty_days);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month, store, person]);

  if (loading) return <p className="text-sm text-zinc-400">加载中...</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <p className="text-sm font-medium text-zinc-500">
          {person} @ {store} 提成明细
        </p>
        <span className="text-xs text-zinc-400">月目标: ¥{monthlyTarget.toFixed(0)}</span>
        <span className="text-xs text-zinc-400">出勤: {dutyDays}天</span>
        <span className="text-xs text-zinc-400">个人目标: ¥{target.toFixed(0)}</span>
        <span className="text-xs text-zinc-400">达标率档位: {bucket}</span>
        <span className="text-xs text-zinc-400">销售: ¥{totalSales.toFixed(0)}</span>
        <span className="text-xs font-medium text-zinc-700">提成: ¥{totalCommission.toFixed(0)}</span>
      </div>
      <Table className="bg-white rounded-lg">
        <TableHeader>
          <TableRow>
            <TableHead>商品档位</TableHead>
            <TableHead className="text-right">销售额</TableHead>
            <TableHead className="text-right">提成比例</TableHead>
            <TableHead className="text-right">提成金额</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((t) => (
            <TableRow key={t.name}>
              <TableCell>
                <button
                  className="text-blue-600 hover:underline cursor-pointer"
                  onClick={() => onTierClick(t.name)}
                >
                  {t.name}
                </button>
              </TableCell>
              <TableCell className="text-right tnum">¥{t.sales.toFixed(2)}</TableCell>
              <TableCell className="text-right">{t.rate_percent}</TableCell>
              <TableCell className="text-right tnum font-medium">¥{t.commission.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SalesDetailContent({ month, store, person, date }: { month: string; store: string; person: string; date: string }) {
  const [items, setItems] = useState<SalesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workflowApi.getSalesDetail(month, store, person, date)
      .then((r) => setItems(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month, store, person, date]);

  if (loading) return <p className="text-sm text-zinc-400">加载中...</p>;

  const tagCounts: Record<string, number> = {};
  items.forEach((item) => {
    tagCounts[item.tag] = (tagCounts[item.tag] || 0) + 1;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-500">当日销售记录（{items.length}笔）</p>
        <div className="flex gap-1.5">
          {Object.entries(tagCounts).map(([tag, count]) => {
            const style = TAG_STYLES[tag] || TAG_STYLES["有效"];
            return (
              <span key={tag} className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded border ${style.color}`}>
                {style.label} {count}
              </span>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 sticky left-0 bg-white z-10">标签</TableHead>
              <TableHead className="min-w-[100px]">小票号</TableHead>
              <TableHead className="min-w-[100px]">源单号</TableHead>
              <TableHead>条码</TableHead>
              <TableHead className="min-w-[120px]">商品名称</TableHead>
              <TableHead className="text-right">单价</TableHead>
              <TableHead className="text-right">数量</TableHead>
              <TableHead className="text-right">金额</TableHead>
              <TableHead>退货</TableHead>
              <TableHead>线上</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>营业员</TableHead>
              <TableHead>收银员</TableHead>
              <TableHead>原始门店</TableHead>
              <TableHead>原始日期</TableHead>
              <TableHead>调整原因</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const style = TAG_STYLES[item.tag] || TAG_STYLES["有效"];
              return (
                <TableRow key={item.id}>
                  <TableCell className="sticky left-0 bg-white z-10">
                    <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded border ${style.color}`}>
                      {style.label}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.receipt}</TableCell>
                  <TableCell className="font-mono text-xs">{item.src_order || ""}</TableCell>
                  <TableCell className="font-mono text-xs">{item.barcode}</TableCell>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-right tnum">¥{item.unit_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right tnum">{item.qty}</TableCell>
                  <TableCell className="text-right tnum font-medium">¥{item.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    {item.is_return && <span className="text-xs text-red-600">✓</span>}
                  </TableCell>
                  <TableCell>
                    {item.is_online && <span className="text-xs text-blue-600">✓</span>}
                  </TableCell>
                  <TableCell className="text-xs">{item.store}</TableCell>
                  <TableCell>{item.salesperson}</TableCell>
                  <TableCell className="text-xs">{item.cashier || ""}</TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {item.original_store && item.original_store !== item.store ? item.original_store : ""}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {item.original_date && item.original_date !== item.sale_date ? item.original_date : ""}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">{item.transfer_reason || ""}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {items.length === 0 && <p className="text-sm text-zinc-400">无销售记录</p>}
    </div>
  );
}

function TierDetailContent({ month, store, person, bucket }: { month: string; store: string; person: string; bucket: string }) {
  const [items, setItems] = useState<SalesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workflowApi.getTierDetail(month, store, person, bucket)
      .then((r) => setItems(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month, store, person, bucket]);

  if (loading) return <p className="text-sm text-zinc-400">加载中...</p>;

  const tagCounts: Record<string, number> = {};
  items.forEach((item) => {
    tagCounts[item.tag] = (tagCounts[item.tag] || 0) + 1;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-500">该档位销售记录（{items.length}笔）</p>
        <div className="flex gap-1.5">
          {Object.entries(tagCounts).map(([tag, count]) => {
            const style = TAG_STYLES[tag] || TAG_STYLES["有效"];
            return (
              <span key={tag} className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded border ${style.color}`}>
                {style.label} {count}
              </span>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 sticky left-0 bg-white z-10">标签</TableHead>
              <TableHead className="min-w-[100px]">小票号</TableHead>
              <TableHead className="min-w-[100px]">源单号</TableHead>
              <TableHead>条码</TableHead>
              <TableHead className="min-w-[120px]">商品名称</TableHead>
              <TableHead className="text-right">单价</TableHead>
              <TableHead className="text-right">数量</TableHead>
              <TableHead className="text-right">金额</TableHead>
              <TableHead>退货</TableHead>
              <TableHead>线上</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>营业员</TableHead>
              <TableHead>收银员</TableHead>
              <TableHead>原始门店</TableHead>
              <TableHead>原始日期</TableHead>
              <TableHead>调整原因</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const style = TAG_STYLES[item.tag] || TAG_STYLES["有效"];
              return (
                <TableRow key={item.id}>
                  <TableCell className="sticky left-0 bg-white z-10">
                    <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded border ${style.color}`}>
                      {style.label}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.receipt}</TableCell>
                  <TableCell className="font-mono text-xs">{item.src_order || ""}</TableCell>
                  <TableCell className="font-mono text-xs">{item.barcode}</TableCell>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-right tnum">¥{item.unit_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right tnum">{item.qty}</TableCell>
                  <TableCell className="text-right tnum font-medium">¥{item.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    {item.is_return && <span className="text-xs text-red-600">✓</span>}
                  </TableCell>
                  <TableCell>
                    {item.is_online && <span className="text-xs text-blue-600">✓</span>}
                  </TableCell>
                  <TableCell className="text-xs">{item.store}</TableCell>
                  <TableCell>{item.salesperson}</TableCell>
                  <TableCell className="text-xs">{item.cashier || ""}</TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {item.original_store && item.original_store !== item.store ? item.original_store : ""}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {item.original_date && item.original_date !== item.sale_date ? item.original_date : ""}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">{item.transfer_reason || ""}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {items.length === 0 && <p className="text-sm text-zinc-400">无销售记录</p>}
    </div>
  );
}
