import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { Calendar, Package, Store, LogOut, User, Target, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { path: "/months", label: "月度计算", icon: Calendar },
  { path: "/salary-policy", label: "薪酬制度", icon: FileSpreadsheet },
  { path: "/targets", label: "月度目标", icon: Target },
  { path: "/products", label: "商品档案", icon: Package },
  { path: "/stores", label: "门店信息", icon: Store },
];

const titles: Record<string, string> = {
  "/months": "月度计算",
  "/salary-policy": "薪酬制度",
  "/products": "商品档案",
  "/stores": "门店信息",
};

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const title = pathname.startsWith("/months/")
    ? `月度工作台`
    : titles[pathname] || "来思尔薪酬管理系统";

  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900 text-[15px] leading-relaxed font-sans">
      {/* ── 侧栏 ── */}
      <aside className="w-[240px] shrink-0 bg-white border-r border-zinc-200 flex flex-col">
        <div className="px-4 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="w-7 h-7 object-contain rounded-md" />
            <div>
              <p className="text-[13px] font-semibold text-zinc-900 leading-tight">来思尔薪酬管理系统</p>
              <p className="text-[11px] text-zinc-400 leading-tight">workspace</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map((n) => {
            const active = n.path === "/" ? pathname === "/" : pathname === n.path || pathname.startsWith(n.path + "/");
            return (
              <button key={n.path} onClick={() => navigate(n.path)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13.5px] transition-colors duration-100",
                  active ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700",
                )}>
                <n.icon className="w-4 h-4 shrink-0" />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-zinc-200 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-zinc-900 truncate leading-tight">{user?.username}</p>
              <p className="text-[11px] text-zinc-400 leading-tight">管理员</p>
            </div>
            <button onClick={() => { logout(); navigate("/login"); }}
              className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── 主区 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[52px] border-b border-zinc-200 bg-white flex items-center px-6 shrink-0">
          <h1 className="text-[17px] font-semibold text-zinc-900">{title}</h1>
        </header>
        <main className="flex-1 overflow-auto p-7 bg-zinc-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
