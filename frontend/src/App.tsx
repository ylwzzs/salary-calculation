import { type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./auth";
import Login from "./pages/Login";
import Layout from "./Layout";
import Products from "./pages/Products";
import Stores from "./pages/Stores";
import Months from "./pages/Months";
import MonthWorkspace from "./pages/MonthWorkspace";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-6 w-6 text-zinc-400" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin h-6 w-6 text-zinc-400" /></div>;
  if (user) return <Navigate to="/months" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/months" element={<Months />} />
            <Route path="/months/:month" element={<MonthWorkspace />} />
            <Route path="/products" element={<Products />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/" element={<Navigate to="/months" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
