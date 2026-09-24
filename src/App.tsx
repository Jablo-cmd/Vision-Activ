import { useState } from "react";
import { Bell, LogOut, Menu, Search } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./screens/Dashboard";
import { Assessment } from "./screens/Assessment";
import { Commitments } from "./screens/Commitments";
import { Review } from "./screens/Review";
import { Trends } from "./screens/Trends";
import { Reports } from "./screens/Reports";
import { Scorecard } from "./screens/Scorecard";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Login } from "./screens/Login";
type Page = "dashboard" | "baseline" | "commitments" | "weekly" | "review" | "trends" | "reports" | "scorecard";
function Workspace() {
  const { user, loading, signOut } = useAuth();
  const [page, setPage] = useState<Page>("dashboard");
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#F4F6F8] text-[#667085]">Loading workspace…</div>;
  if (!user) return <Login />;
  const content = page === "dashboard" ? <Dashboard onNavigate={setPage} /> : page === "baseline" ? <Assessment type="baseline" /> : page === "weekly" ? <Scorecard /> : page === "commitments" ? <Commitments /> : page === "review" ? <Review /> : page === "trends" ? <Trends /> : <Reports />;
  return <div className="flex min-h-screen bg-[#F4F6F8]"><Sidebar page={page} onNavigate={setPage} /><div className="min-w-0 flex-1"><header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8"><div className="flex items-center gap-3"><Menu className="lg:hidden" size={20} /><div className="hidden items-center gap-2 rounded-xl bg-[#F4F6F8] px-3 py-2 md:flex"><Search size={16} className="text-[#667085]" /><span className="text-sm text-[#667085]">Search workspace</span></div></div><div className="flex items-center gap-3"><Bell size={19} className="text-[#667085]" /><button aria-label="Sign out" onClick={signOut} className="rounded-lg p-2 hover:bg-[#F4F6F8]"><LogOut size={18} /></button><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0072CE] text-sm font-bold text-white">{(user.email?.slice(0, 2) || "VA").toUpperCase()}</div></div></header><main className="mx-auto max-w-7xl p-4 md:p-8">{content}</main></div></div>;
}
export default function App() { return <AuthProvider><Workspace /></AuthProvider>; }