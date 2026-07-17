import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { monthsApi, monthStepApi } from "../api";
import StepIndicator from "./steps/StepIndicator";
import ImportStep from "./steps/ImportStep";
import TargetsStep from "./steps/TargetsStep";
import DutyStep from "./steps/DutyStep";
import ResultsStep from "./steps/ResultsStep";

const STEP_MAP = ["import", "targets", "duty", "results"];

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

  const handleStepChange = async (step: string) => {
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
        {currentStep === "duty" && <DutyStep month={month!} />}
        {currentStep === "results" && <ResultsStep month={month!} />}
      </div>
    </div>
  );
}
