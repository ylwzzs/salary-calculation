import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

export function Block({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick}
      className={cn(
        "group rounded-lg border border-transparent px-4 py-3 -mx-4 transition-all duration-100",
        onClick && "cursor-pointer",
        "hover:border-zinc-200 hover:bg-zinc-50/60 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        className,
      )}>
      {children}
    </div>
  );
}

export function BlockTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-zinc-800 mb-1">{children}</h3>;
}

export function BlockDescription({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-zinc-400 leading-relaxed">{children}</p>;
}

export function Callout({ icon, variant = "default", children }: { icon?: ReactNode; variant?: "default" | "info" | "warning" | "success" | "error"; children: ReactNode }) {
  const styles = {
    default: "bg-zinc-50 border-zinc-200",
    info: "bg-blue-50/60 border-blue-200",
    warning: "bg-amber-50/60 border-amber-200",
    success: "bg-emerald-50/60 border-emerald-200",
    error: "bg-red-50/60 border-red-200",
  };
  return (
    <div className={cn("rounded-lg border p-3.5 flex gap-3 text-sm leading-relaxed", styles[variant])}>
      {icon && <div className="mt-0.5 shrink-0 opacity-70">{icon}</div>}
      <div className="text-zinc-700">{children}</div>
    </div>
  );
}

export function Divider() {
  return <hr className="border-zinc-200 my-3" />;
}
