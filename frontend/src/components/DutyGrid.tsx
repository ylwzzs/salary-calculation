import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface DutyGridProps {
  month: string;
  grid: Record<string, Record<string, string | string[]>>;
  onChange: (store: string, date: string, value: string) => void;
  onTransfer: (fromStore: string, toStore: string, date: string, person: string) => void;
}

export default function DutyGrid({ month, grid, onChange, onTransfer }: DutyGridProps) {
  const [dragItem, setDragItem] = useState<{ store: string; person: string; date: string } | null>(null);

  const stores = Object.keys(grid);
  const dates = useMemo(() => {
    const s = new Set<string>();
    Object.values(grid).forEach((d) => Object.keys(d).forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [grid]);

  const isMulti = (value: string | string[]) => Array.isArray(value);

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-zinc-50/80 border-b">
            <th className="sticky left-0 bg-zinc-50/80 border-r px-3 py-2.5 text-left font-medium text-zinc-500 min-w-[100px]">
              门店
            </th>
            {dates.map((d) => (
              <th
                key={d}
                className="border-r px-2 py-2.5 text-center font-medium text-zinc-500 min-w-[60px] last:border-r-0"
              >
                {d.slice(8)}号
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => (
            <tr key={store} className="border-b last:border-b-0">
              <td className="sticky left-0 bg-white border-r px-3 py-2 font-medium text-zinc-700">
                {store}
              </td>
              {dates.map((date) => {
                const value = grid[store]?.[date];
                const multi = isMulti(value);
                const people = multi ? (value as string[]) : value ? [value] : [];

                return (
                  <td
                    key={date}
                    className={cn(
                      "border-r px-1 py-1.5 text-center last:border-r-0",
                      multi && "bg-red-50"
                    )}
                    onDragOver={(e) => {
                      if (dragItem) {
                        e.preventDefault();
                        e.currentTarget.style.background = "#dbeafe";
                      }
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.background = multi ? "#fef2f2" : "";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.background = "";
                      if (dragItem && people.length === 1 && !multi) {
                        onTransfer(dragItem.store, store, date, dragItem.person);
                        setDragItem(null);
                      }
                    }}
                  >
                    {multi ? (
                      <div className="flex items-center justify-center gap-0.5 flex-wrap">
                        {(value as string[]).map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center gap-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded cursor-grab"
                            draggable
                            onDragStart={() => setDragItem({ store, person: p, date })}
                            title={`${p}: 查看详情`}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    ) : people.length === 1 ? (
                      <span
                        className="text-zinc-700 cursor-pointer hover:text-blue-600"
                        draggable
                        onDragStart={() => setDragItem({ store, person: people[0], date })}
                      >
                        {people[0]}
                      </span>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
