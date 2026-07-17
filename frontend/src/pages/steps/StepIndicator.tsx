import { Check, ChevronRight } from "lucide-react";

interface StepIndicatorProps {
  current: string;
  stepData: Record<string, boolean>;
  onStepChange: (step: string) => void;
}

const STEPS = [
  { key: "import", label: "① 导入数据" },
  { key: "targets", label: "② 配置目标" },
  { key: "duty", label: "③ 当班确认" },
  { key: "results", label: "④ 计算&结果" },
];

export default function StepIndicator({ current, stepData, onStepChange }: StepIndicatorProps) {
  return (
    <div className="flex items-center w-full bg-white rounded-lg border border-zinc-200 p-1">
      {STEPS.map((step, i) => {
        const isCurrent = step.key === current;
        const isDone = stepData[step.key];
        const isLast = i === STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <button
              onClick={() => onStepChange(step.key)}
              className={`flex-1 py-2.5 px-3 text-center text-sm font-medium transition-colors rounded-md ${
                isCurrent
                  ? "bg-blue-50 text-blue-700"
                  : isDone
                  ? "text-emerald-600 hover:bg-zinc-50"
                  : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {isDone && !isCurrent && <Check className="w-3.5 h-3.5" />}
                {step.label}
              </span>
            </button>
            {!isLast && (
              <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}
