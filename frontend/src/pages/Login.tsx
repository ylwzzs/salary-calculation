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
        <div className="w-32 h-32 mx-auto mb-5">
          <img src="/logo.png" alt="来思尔" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 mb-1">来思尔薪酬管理系统</h1>
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
