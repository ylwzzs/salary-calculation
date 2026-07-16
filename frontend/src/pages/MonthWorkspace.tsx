import { useState } from "react";
import { useParams } from "react-router-dom";
import { Steps, Card, Button, Space } from "antd";
import ImportStep from "./steps/ImportStep";
import TargetsStep from "./steps/TargetsStep";
import DutyStep from "./steps/DutyStep";
import ResultsStep from "./steps/ResultsStep";

const STEP_TITLES = ["导入数据", "配置目标", "当班确认", "计算", "结果"];

export default function MonthWorkspace() {
  const { month = "" } = useParams();
  const [cur, setCur] = useState(0);

  return (
    <Card title={`月度工作台 · ${month}`}>
      <Steps
        current={cur}
        items={STEP_TITLES.map((t) => ({ title: t }))}
        style={{ marginBottom: 24 }}
      />
      <div style={{ marginBottom: 16 }}>
        {cur === 0 && <ImportStep month={month} />}
        {cur === 1 && <TargetsStep month={month} />}
        {cur === 2 && <DutyStep month={month} />}
        {cur === 3 && <ResultsStep month={month} onComputed={() => setCur(4)} />}
        {cur === 4 && <ResultsStep month={month} />}
      </div>
      <Space>
        <Button disabled={cur === 0} onClick={() => setCur(cur - 1)}>
          上一步
        </Button>
        <Button disabled={cur === 4} type="primary" onClick={() => setCur(cur + 1)}>
          下一步
        </Button>
      </Space>
    </Card>
  );
}
