import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await login(fd.get("username") as string, fd.get("password") as string);
      toast.success("登录成功");
      nav("/months", { replace: true });
    } catch {
      toast.error("账号或密码错误");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-[320px] text-center">
        <div className="w-11 h-11 mx-auto mb-5 rounded-lg bg-zinc-900 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M9 2h6l1.5 4H7.5L9 2Z"/><path d="M7.5 6h9l-1 2.2a4 4 0 0 0-.4 1.7V20a2 2 0 0 1-2 2h-2.2a2 2 0 0 1-2-2V9.9a4 4 0 0 0-.4-1.7L7.5 6Z"/><rect x="8.5" y="12" width="7" height="3.4" rx="0.6" fill="#2563EB"/>
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 mb-1">牛奶业绩提成</h1>
        <p className="text-sm text-zinc-400 mb-8">登录以继续</p>
        <form onSubmit={onSubmit} className="space-y-4 text-left">
          <div><Label htmlFor="username" className="text-[13px] text-zinc-500 font-medium">账号</Label>
            <Input id="username" name="username" placeholder="admin" className="mt-1.5 h-10" required /></div>
          <div><Label htmlFor="password" className="text-[13px] text-zinc-500 font-medium">密码</Label>
            <Input id="password" name="password" type="password" placeholder="admin" className="mt-1.5 h-10" required /></div>
          <Button type="submit" className="w-full h-10 font-semibold" disabled={busy}>
            {busy ? "登录中..." : "继续"}
          </Button>
        </form>
        <p className="text-[12px] text-zinc-400 mt-6">演示账号 <span className="text-zinc-700 font-medium">admin</span> / <span className="text-zinc-700 font-medium">admin</span></p>
      </div>
    </div>
  );
}
