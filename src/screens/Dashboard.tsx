import { ArrowUpRight, CheckCircle2, Clock3, Target, TrendingUp, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Badge } from "../components/ui";
import { DIMENSION_WORKFLOWS } from "../types";
import { getCurrentUserDashboard, getManagementSnapshot } from "../services/data";
type DashboardData = Awaited<ReturnType<typeof getCurrentUserDashboard>>;
export function Dashboard({
  onNavigate,
}: {
  onNavigate: (p: "baseline" | "commitments" | "weekly" | "track") => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [management, setManagement] = useState<Awaited<
    ReturnType<typeof getManagementSnapshot>
  > | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getCurrentUserDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Unable to load dashboard."));
  }, []);
  const score = data?.average == null ? "—" : data.average.toFixed(1);
  const commitments = data?.commitments.length ?? 0;
  const completed = data?.commitments.filter((c) => c.status === "complete").length ?? 0;
  const overdue =
    data?.commitments.filter(
      (c) =>
        c.status !== "complete" && c.due_date && new Date(c.due_date + "T23:59:59") < new Date(),
    ).length ?? 0;
  useEffect(() => {
    if (["manager", "ceo", "admin"].includes(data?.organization.role ?? ""))
      getManagementSnapshot()
        .then(setManagement)
        .catch(() => undefined);
  }, [data?.organization.role]);
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-[#2563EB] p-7 text-white shadow-xl md:p-10">
        <div className="max-w-4xl">
          <Badge>HIGH-PERFORMANCE OPERATING FRAMEWORK</Badge>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
            Assess. Commit. Track. Review. Improve.
          </h1>
          <p className="mt-4 max-w-2xl text-slate-300">
            A disciplined weekly operating rhythm across 12 dimensions, connecting self-assessment
            to evidence, commitments, scorecards and management review.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate("weekly")}
              className="rounded-xl bg-[#60A5FA] px-5 py-3 font-bold hover:bg-[#3B82F6]"
            >
              Complete weekly scorecard <ArrowUpRight size={17} className="ml-2 inline" />
            </button>
            <button
              onClick={() => onNavigate("commitments")}
              className="rounded-xl border border-white/20 px-5 py-3 font-bold hover:bg-white/10"
            >
              Open PICC
            </button>
            <button
              onClick={() => onNavigate("track")}
              className="rounded-xl border border-white/20 px-5 py-3 font-bold hover:bg-white/10"
            >
              Track execution
            </button>
          </div>
        </div>
      </div>
      {error && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="p-5">
          <TrendingUp size={20} className="text-[#60A5FA]" />
          <p className="mt-4 text-sm text-[#64748B]">Current score</p>
          <p className="text-2xl font-bold text-[#2563EB]">
            {score}
            <span className="ml-2 text-xs text-slate-400">/ 5.0</span>
          </p>
        </Card>
        <Card className="p-5">
          <Target size={20} className="text-[#60A5FA]" />
          <p className="mt-4 text-sm text-[#64748B]">Dimensions</p>
          <p className="text-2xl font-bold text-[#2563EB]">
            12<span className="ml-2 text-xs text-slate-400">weekly</span>
          </p>
        </Card>
        <Card className="p-5">
          <Clock3 size={20} className="text-[#60A5FA]" />
          <p className="mt-4 text-sm text-[#64748B]">Commitments</p>
          <p className="text-2xl font-bold text-[#2563EB]">
            {commitments}
            <span className="ml-2 text-xs text-slate-400">{completed} complete</span>
          </p>
        </Card>
        <Card className="p-5">
          <CircleAlert size={20} className="text-[#60A5FA]" />
          <p className="mt-4 text-sm text-[#64748B]">Overdue</p>
          <p className="text-2xl font-bold text-[#2563EB]">{overdue}</p>
        </Card>
        <Card className="p-5">
          <CheckCircle2 size={20} className="text-[#60A5FA]" />
          <p className="mt-4 text-sm text-[#64748B]">Current cycle</p>
          <p className="text-sm font-bold text-[#2563EB] mt-2">
            {data?.cycle ? data.cycle.week_start + " → " + data.cycle.week_end : "Loading"}
          </p>
        </Card>
      </div>
      {management && (
        <Card className="p-6">
          <h2 className="text-lg font-bold text-[#173B6C]">Leadership overview</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-[#64748B]">Team members</p>
              <p className="text-2xl font-bold text-[#2563EB]">{management.members.length}</p>
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Latest team score</p>
              <p className="text-2xl font-bold text-[#2563EB]">
                {management.average == null ? "—" : management.average.toFixed(1) + "/5"}
              </p>
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Weekly submissions</p>
              <p className="text-2xl font-bold text-[#2563EB]">{management.weeklyCount}</p>
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Completed commitments</p>
              <p className="text-2xl font-bold text-[#2563EB]">{management.completed}</p>
            </div>
          </div>
        </Card>
      )}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-[#173B6C]">12-dimension operating rhythm</h2>
        <p className="text-sm text-[#64748B]">
          Each dimension follows Assess → Commit → Track → Review → Improve.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {DIMENSION_WORKFLOWS.map((d, i) => (
            <div key={d.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-[#60A5FA]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-semibold text-[#2563EB]">{d.name}</span>
              </div>
              <p className="mt-2 text-xs text-[#64748B]">{d.weeklyPrompt}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {d.scorecardMetrics.map((m) => (
                  <span
                    key={m}
                    className="rounded-full bg-[#EFF6FF] px-2 py-1 text-[11px] text-[#64748B]"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
