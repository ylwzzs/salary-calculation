import { useState } from "react";
import { Upload, message, Space, Tag } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { workflowApi } from "../../api";

const { Dragger } = Upload;

export default function ImportStep({ month }: { month: string }) {
  const [sales, setSales] = useState(false);
  const [gifts, setGifts] = useState(false);

  const upload = (kind: "sales" | "gifts") => ({
    multiple: false,
    showUploadList: false,
    accept: ".xlsx,.xls",
    beforeUpload: (file: File) => {
      (kind === "sales" ? workflowApi.importSales : workflowApi.importGifts)(month, file)
        .then(() => {
          kind === "sales" ? setSales(true) : setGifts(true);
          message.success("上传成功");
        })
        .catch(() => message.error("上传失败"));
      return false;
    },
  });

  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      <div>销售流水 {sales && <Tag color="green">已上传</Tag>}</div>
      <Dragger {...upload("sales")}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p>点击或拖拽「销售流水」xlsx</p>
      </Dragger>
      <div>让利明细（赠送清单） {gifts && <Tag color="green">已上传</Tag>}</div>
      <Dragger {...upload("gifts")}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p>点击或拖拽「让利明细」xlsx（可选）</p>
      </Dragger>
    </Space>
  );
}
