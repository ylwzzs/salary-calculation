import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { monthsApi, monthStepApi, targetsApi, workflowApi } from "../api";
import { toast } from "sonner";
import StepIndicator from "./steps/StepIndicator";
import ImportStep from "./steps/ImportStep";
import TargetsStep from "./steps/TargetsStep";
import DutyStep from "./steps/DutyStep";
import ResultsStep from "./steps/ResultsStep";

export default function MonthWorkspace() {
  const { month = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [stepData, setStepData] = useState<Record<string, boolean>>({});

  const currentStep = searchParams.get("step") || "import";

  useEffect(() => {
    const load = async () => {
      try {
        const data = await monthsApi.list();
        const m = data.find((x) => x.month === month);
        if (m) {
          setStepData(m.step_data || {});
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [month]);

  // 校验：导入数据 → 配置目标
  const validateImportToTargets = async (): Promise<boolean> => {
    try {
      const m = await monthsApi.get(month);
      if (!m.sales_file || !m.gifts_file) {
        toast.error("请先导入数据（销售流水和让利明细）", {
          description: "需要上传两个文件后才能配置目标",
        });
        return false;
      }
      return true;
    } catch {
      toast.error("获取月份信息失败");
      return false;
    }
  };

  // 校验：配置目标 → 当班确认
  const validateTargetsToDuty = async (): Promise<boolean> => {
    try {
      // 获取所有门店
      const stores = await import("../api").then((m) => m.storesApi.list());
      const activeStores = stores.filter((s) => !s.exclude_assessment);

      // 获取已有目标
      const targets = await targetsApi.list(month);
      const targetMap = new Map(targets.map((t) => [t.store, t.target]));

      // 检查是否有门店未配置目标或目标为0
      const missingStores = activeStores.filter((s) => {
        const target = targetMap.get(s.name);
        return !target || target <= 0;
      });

      if (missingStores.length > 0) {
        const names = missingStores.slice(0, 3).map((s) => s.name).join("、");
        const suffix = missingStores.length > 3 ? `等${missingStores.length}家门店` : "";
        toast.error(`请确保所有门店都配置了目标`, {
          description: `${names}${suffix}未配置目标或目标为0。如不参与考核，请在门店管理页面标记。`,
        });
        return false;
      }
      return true;
    } catch {
      toast.error("校验目标配置失败");
      return false;
    }
  };

  // 校验：当班确认 → 计算结果
  const validateDutyToResults = async (): Promise<boolean> => {
    try {
      const duty = await workflowApi.getDuty(month);
      if (!duty || Object.keys(duty).length === 0) {
        toast.error("请先确认当班排班", {
          description: "需要在当班确认步骤点击「确认当班」后才能计算结果",
        });
        return false;
      }
      return true;
    } catch {
      toast.error("获取当班数据失败");
      return false;
    }
  };

  const handleStepChange = async (step: string) => {
    // 校验前置条件
    if (step === "targets" && currentStep === "import") {
      if (!(await validateImportToTargets())) return;
    } else if (step === "duty" && currentStep !== "duty") {
      if (!(await validateImportToTargets())) return;
      if (!(await validateTargetsToDuty())) return;
    } else if (step === "results" && currentStep !== "results") {
      if (!(await validateImportToTargets())) return;
      if (!(await validateTargetsToDuty())) return;
      if (!(await validateDutyToResults())) return;
    }

    // 更新步骤数据
    const newData = { ...stepData, [currentStep]: true };
    setStepData(newData);
    await monthStepApi.update(month!, step, newData).catch(() => {});
    setSearchParams({ step });
  };

  if (loading) {
    return <div className="text-sm text-zinc-400">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          月度工作台 · <span className="text-zinc-500">{month}</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          导入 → 配置目标 → 当班确认 → 计算 → 查看结果
        </p>
      </div>

      <StepIndicator current={currentStep} stepData={stepData} onStepChange={handleStepChange} />

      <div>
        {currentStep === "import" && <ImportStep month={month!} />}
        {currentStep === "targets" && <TargetsStep month={month!} />}
        {currentStep === "duty" && <DutyStep month={month!} onNext={() => handleStepChange("results")} />}
        {currentStep === "results" && <ResultsStep month={month!} />}
      </div>
    </div>
  );
}
