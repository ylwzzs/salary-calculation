import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RightDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function RightDrawer({ open, title, onClose, children }: RightDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      {/* 抽屉 */}
      <div className="fixed right-0 top-0 bottom-0 w-[80vw] max-w-[1200px] bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {children}
        </div>
      </div>
    </>
  );
}
