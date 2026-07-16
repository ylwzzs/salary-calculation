import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImportStep from "./steps/ImportStep";
import TargetsStep from "./steps/TargetsStep";
import DutyStep from "./steps/DutyStep";
import ResultsStep from "./steps/ResultsStep";

export default function MonthWorkspace() {
  const { month = "" } = useParams();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">月度工作台 · <span className="text-zinc-500">{month}</span></h2>
        <p className="text-sm text-zinc-400 mt-0.5">导入 → 配置目标 → 当班确认 → 计算 → 查看结果</p>
      </div>
      <Tabs defaultValue="import" className="space-y-4">
        <TabsList className="bg-white border border-zinc-200 rounded-lg h-auto p-1 gap-0.5">
          <TabsTrigger value="import" className="rounded-md text-[13px]">① 导入数据</TabsTrigger>
          <TabsTrigger value="targets" className="rounded-md text-[13px]">② 配置目标</TabsTrigger>
          <TabsTrigger value="duty" className="rounded-md text-[13px]">③ 当班确认</TabsTrigger>
          <TabsTrigger value="results" className="rounded-md text-[13px]">④ 计算&amp;结果</TabsTrigger>
        </TabsList>
        <TabsContent value="import"><ImportStep month={month} /></TabsContent>
        <TabsContent value="targets"><TargetsStep month={month} /></TabsContent>
        <TabsContent value="duty"><DutyStep month={month} /></TabsContent>
        <TabsContent value="results"><ResultsStep month={month} /></TabsContent>
      </Tabs>
    </div>
  );
}
