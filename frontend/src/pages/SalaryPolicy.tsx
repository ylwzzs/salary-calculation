import { useEffect, useState } from "react";
import { salaryPolicyApi, type SalaryPolicyVersion, type SalaryPolicySummary } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Save, X, FileSpreadsheet, FileText, Image, Plus, Trash2 } from "lucide-react";
import { Block, BlockTitle } from "@/components/Block";
import { toast } from "sonner";

const CLASSES = ["A", "B", "C", "D"];
const BUCKETS = ["GE_100", "90_100", "80_90", "70_80", "LT_70"];
const TIERS = ["低温低毛", "低温高毛", "常温低毛", "常温高毛", "特价"];

function bucketLabel(bucket: string): string {
  switch (bucket) {
    case "GE_100": return ">=100%";
    case "LT_70": return "<70%";
    default: return bucket.replace("_", "-") + "%";
  }
}

export default function SalaryPolicy() {
  const [versions, setVersions] = useState<SalaryPolicySummary[]>([]);
  const [currentVersion, setCurrentVersion] = useState<SalaryPolicyVersion | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState<Record<string, any> | null>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await salaryPolicyApi.list();
      setVersions(data);
      if (data.length === 0) {
        setSelectedId(null);
        setCurrentVersion(null);
        return;
      }
      // 检查当前选中的版本是否还在列表中
      const selectedExists = selectedId && data.some((v) => v.id === selectedId);
      if (!selectedId || !selectedExists) {
        // 没有选中或选中的已被删除，自动选择当前生效版本或第一个
        const current = data.find((v) => v.is_current) || data[0];
        setSelectedId(current.id);
        const detail = await salaryPolicyApi.get(current.id);
        setCurrentVersion(detail);
      } else if (!editMode) {
        // 重新加载当前选中的版本
        const detail = await salaryPolicyApi.get(selectedId);
        setCurrentVersion(detail);
      }
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = async (id: number) => {
    if (editMode) return;
    setSelectedId(id);
    try {
      const detail = await salaryPolicyApi.get(id);
      setCurrentVersion(detail);
    } catch {
      toast.error("加载版本失败");
    }
  };

  const handleCreateNew = () => {
    if (!currentVersion) {
      toast.error("无当前版本可复制");
      return;
    }
    setEditContent(JSON.parse(JSON.stringify(currentVersion.content)));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEffectiveDate(tomorrow.toISOString().split("T")[0]);
    setNote("");
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!effectiveDate) {
      toast.error("请填写生效日期");
      return;
    }
    try {
      const newVersion = await salaryPolicyApi.create({
        effective_from: effectiveDate,
        note: note || undefined,
        content: editContent as any,
      });
      toast.success(`版本 v${newVersion.version} 已保存并激活`);
      setEditMode(false);
      loadVersions();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "保存失败");
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditContent(null);
  };

  const handleActivate = async (id: number) => {
    if (!confirm("确定激活此版本？当前生效版本将被停用。")) return;
    try {
      await salaryPolicyApi.activate(id);
      toast.success("已激活");
      loadVersions();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "激活失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除此版本？")) return;
    try {
      await salaryPolicyApi.delete(id);
      toast.success("已删除");
      loadVersions(); // loadVersions 会自动切换到有效版本
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "删除失败");
    }
  };

  const handleExportExcel = async () => {
    if (!currentVersion) return;
    try {
      const token = localStorage.getItem("salary_token");
      const response = await fetch(`/api/salary-policies/${currentVersion.id}/export/excel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("导出失败");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salary_policy_v${currentVersion.version}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("导出成功");
    } catch {
      toast.error("导出失败");
    }
  };

  const handleExportPDF = async () => {
    if (!currentVersion) return;
    try {
      const token = localStorage.getItem("salary_token");
      const response = await fetch(`/api/salary-policies/${currentVersion.id}/export/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("导出失败");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salary_policy_v${currentVersion.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("导出成功");
    } catch {
      toast.error("导出失败");
    }
  };

  const handleCopyImage = async () => {
    if (!currentVersion) return;
    try {
      const token = localStorage.getItem("salary_token");
      const response = await fetch(`/api/salary-policies/${currentVersion.id}/export/image`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "导出失败");
      }
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("图片已复制到剪贴板");
    } catch (e: any) {
      toast.error(e.message || "复制失败");
    }
  };

  const updateRate = (cls: string, bucket: string, tier: string, value: string) => {
    setEditContent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        commission_rates: {
          ...prev.commission_rates,
          [cls]: {
            ...prev.commission_rates[cls],
            [bucket]: {
              ...prev.commission_rates[cls][bucket],
              [tier]: value,
            },
          },
        },
      };
    });
  };

  const updateMarginRule = (cat: string, tier: string, field: string, value: string) => {
    setEditContent((prev) => {
      if (!prev) return prev;
      const numVal = value === "" ? null : Number(value);
      return {
        ...prev,
        margin_rules: {
          ...prev.margin_rules,
          [cat]: {
            ...prev.margin_rules[cat],
            [tier]: {
              ...(prev.margin_rules[cat]?.[tier] || {}),
              [field]: numVal,
            },
          },
        },
      };
    });
  };

  const renderMarginRules = (marginRules: Record<string, any>) => {
    const categories = Object.keys(marginRules);
    if (categories.length === 0) {
      return <div className="text-sm text-zinc-400">暂无毛利率规则</div>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>商品分类</TableHead>
            <TableHead>正价</TableHead>
            <TableHead>低价</TableHead>
            <TableHead>特价</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((cat) => {
            const rules = marginRules[cat] || {};
            const highMin = rules.high?.min ?? "";
            const lowMin = rules.low?.min ?? "";
            const lowMax = rules.low?.max ?? "";
            const specialMax = rules.special?.max ?? "";
            return (
              <TableRow key={cat}>
                <TableCell className="font-medium">{cat}</TableCell>
                <TableCell>{highMin ? `>${highMin}%` : "-"}</TableCell>
                <TableCell>
                  {lowMin && lowMax ? `${lowMin}-${lowMax}%` : lowMin ? `>=${lowMin}%` : lowMax ? `<=${lowMax}%` : "-"}
                </TableCell>
                <TableCell>{specialMax ? `<=${specialMax}%` : "-"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const renderMarginRulesEdit = (marginRules: Record<string, any>) => {
    const categories = Object.keys(marginRules);
    if (categories.length === 0) {
      return <div className="text-sm text-zinc-400">暂无毛利率规则</div>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>商品分类</TableHead>
            <TableHead>正价 最低毛利率(%)</TableHead>
            <TableHead>低价 最低(%)</TableHead>
            <TableHead>低价 最高(%)</TableHead>
            <TableHead>特价 最高(%)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((cat) => {
            const rules = marginRules[cat] || {};
            return (
              <TableRow key={cat}>
                <TableCell className="font-medium">{cat}</TableCell>
                <TableCell className="p-1">
                  <Input
                    type="number"
                    value={rules.high?.min ?? ""}
                    onChange={(e) => updateMarginRule(cat, "high", "min", e.target.value)}
                    className="h-7 w-16 text-center"
                    placeholder="17"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    type="number"
                    value={rules.low?.min ?? ""}
                    onChange={(e) => updateMarginRule(cat, "low", "min", e.target.value)}
                    className="h-7 w-16 text-center"
                    placeholder="10"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    type="number"
                    value={rules.low?.max ?? ""}
                    onChange={(e) => updateMarginRule(cat, "low", "max", e.target.value)}
                    className="h-7 w-16 text-center"
                    placeholder="17"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    type="number"
                    value={rules.special?.max ?? ""}
                    onChange={(e) => updateMarginRule(cat, "special", "max", e.target.value)}
                    className="h-7 w-16 text-center"
                    placeholder="10"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const renderCommissionRatesView = (rates: Record<string, any>) => {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>达成档位</TableHead>
              <TableHead>商品档位</TableHead>
              {CLASSES.map((c) => (
                <TableHead key={c} className="text-center">
                  {c}类
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {BUCKETS.map((bucket) =>
              TIERS.map((tier, i) => (
                <TableRow key={`${bucket}-${tier}`}>
                  {i === 0 && (
                    <TableCell rowSpan={5} className="font-medium bg-zinc-50/50">
                      {bucketLabel(bucket)}
                    </TableCell>
                  )}
                  <TableCell className={tier === "特价" ? "text-zinc-400" : ""}>{tier}</TableCell>
                  {CLASSES.map((cls) => (
                    <TableCell key={cls} className="text-center">
                      {rates?.[cls]?.[bucket]?.[tier] ?? "-"}%
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderCommissionRatesEdit = (rates: Record<string, any>) => {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>达成档位</TableHead>
              <TableHead>商品档位</TableHead>
              {CLASSES.map((c) => (
                <TableHead key={c} className="text-center">
                  {c}类
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {BUCKETS.map((bucket) =>
              TIERS.map((tier, i) => (
                <TableRow key={`${bucket}-${tier}`}>
                  {i === 0 && (
                    <TableCell rowSpan={5} className="font-medium bg-zinc-50/50">
                      {bucketLabel(bucket)}
                    </TableCell>
                  )}
                  <TableCell className={tier === "特价" ? "text-zinc-400" : ""}>{tier}</TableCell>
                  {CLASSES.map((cls) => (
                    <TableCell key={cls} className="p-1">
                      <Input
                        type="number"
                        value={rates?.[cls]?.[bucket]?.[tier] ?? ""}
                        onChange={(e) => updateRate(cls, bucket, tier, e.target.value)}
                        className="h-7 w-14 text-center"
                        disabled={tier === "特价"}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Block>
        <div className="flex items-center justify-between">
          <BlockTitle>
            薪酬制度
            {currentVersion && !editMode && (
              <Badge variant="outline" className="ml-2">
                v{currentVersion.version}
                {currentVersion.is_current && " (生效中)"}
              </Badge>
            )}
          </BlockTitle>
          <div className="flex gap-2">
            {!editMode && (
              <>
                <Button size="sm" onClick={handleCreateNew} disabled={versions.length === 0}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  创建新版本
                </Button>
                {currentVersion && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleExportExcel}>
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
                      导出Excel
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExportPDF}>
                      <FileText className="w-3.5 h-3.5 mr-1" />
                      导出PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCopyImage}>
                      <Image className="w-3.5 h-3.5 mr-1" />
                      复制图片
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </Block>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex gap-5">
        {/* Left Sidebar: Timeline */}
        <div className="w-56 shrink-0">
          <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
            <div className="px-3 py-2.5 border-b border-zinc-100">
              <h3 className="text-xs font-medium text-zinc-500">版本历史</h3>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
              <div className="p-2 space-y-1">
                {versions.length === 0 && !loading && (
                  <div className="text-xs text-zinc-400 text-center py-4">暂无版本</div>
                )}
                {versions.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => handleSelect(v.id)}
                    className={`p-2.5 rounded-md cursor-pointer transition-colors ${
                      selectedId === v.id
                        ? "bg-blue-50 border border-blue-200"
                        : "hover:bg-zinc-50 border border-transparent"
                    } ${editMode ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          v.is_current ? "bg-emerald-500" : "bg-zinc-300"
                        }`}
                      />
                      <span className="text-sm font-medium">v{v.version}</span>
                      {v.is_current && (
                        <Badge className="text-[10px] h-4 px-1" variant="default">
                          生效中
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {v.effective_from}
                    </div>
                    {v.note && <div className="text-xs text-zinc-500 mt-0.5 truncate">{v.note}</div>}
                    {v.used_by_months.length > 0 && (
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        已关联: {v.used_by_months.join(", ")}
                      </div>
                    )}
                    {!v.is_current && selectedId === v.id && !editMode && (
                      <div className="flex gap-1 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActivate(v.id);
                          }}
                        >
                          激活
                        </Button>
                        {v.used_by_months.length === 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(v.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Content */}
        <div className="flex-1 min-w-0">
          {editMode ? (
            <Block>
              {/* Edit Mode Header */}
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-zinc-100">
                <div className="flex gap-4 items-center">
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">生效日期 *</label>
                    <Input
                      type="date"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="h-8 w-36"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">版本备注</label>
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="可选"
                      className="h-8 w-48"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave}>
                    <Save className="w-3.5 h-3.5 mr-1" />
                    保存新版本
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancel}>
                    <X className="w-3.5 h-3.5 mr-1" />
                    取消
                  </Button>
                </div>
              </div>

              {/* Margin Rules - Editable */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-zinc-700 mb-2">毛利率分类规则 (%)</h3>
                <p className="text-xs text-zinc-400 mb-3">
                  正价：毛利率 > 最低值；低价：最低 ≤ 毛利率 ≤ 最高；特价：毛利率 ≤ 最高值
                </p>
                {editContent?.margin_rules && renderMarginRulesEdit(editContent.margin_rules)}
              </div>

              {/* Commission Rates - Editable */}
              <div>
                <h3 className="text-sm font-medium text-zinc-700 mb-2">提成比例表 (%)</h3>
                <p className="text-xs text-zinc-400 mb-3">
                  特价档固定为 1%，不可编辑。其他单元格可输入提成比例。
                </p>
                {editContent?.commission_rates && renderCommissionRatesEdit(editContent.commission_rates)}
              </div>
            </Block>
          ) : currentVersion ? (
            <Block>
              {/* Margin Rules */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-zinc-700 mb-2">毛利率分类规则</h3>
                {renderMarginRules(currentVersion.content.margin_rules)}
              </div>

              {/* Commission Rates */}
              <div>
                <h3 className="text-sm font-medium text-zinc-700 mb-2">提成比例表 (%)</h3>
                {renderCommissionRatesView(currentVersion.content.commission_rates)}
              </div>

              {/* Version Info */}
              <div className="mt-4 pt-4 border-t border-zinc-100 text-xs text-zinc-400">
                创建于 {currentVersion.created_at}
                {currentVersion.created_by && ` by ${currentVersion.created_by}`}
              </div>
            </Block>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center">
              <div className="text-zinc-400 text-sm mb-3">暂无薪酬制度版本</div>
              <p className="text-xs text-zinc-300">
                请先运行数据迁移脚本或通过 API 创建初始版本
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
