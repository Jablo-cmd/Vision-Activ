import { Link } from "react-router-dom";

export type LoopStage = {
  key: string;
  label: string;
  to: string;
  /** Short, factual status for this stage, derived from real data. */
  note: string;
  /** True when the stage needs the person's attention right now. */
  attention?: boolean;
};

/**
 * The operating loop (Assess → Commit → Track → Act → Verify → Review → Improve) with where the
 * person stands in each stage. Status is never colour-only: attention adds a text marker.
 */
export function LoopStrip({ stages }: { stages: LoopStage[] }) {
  return (
    <nav aria-label="Operating loop">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stages.map((s, i) => (
          <li key={s.key}>
            <Link
              to={s.to}
              className={
                "block h-full rounded-xl border p-3 transition-colors hover:border-brand-300 hover:bg-brand-50 " +
                (s.attention ? "border-warn-700/40 bg-warn-50" : "border-line bg-white")
              }
            >
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">
                  {i + 1}
                </span>
                {s.label}
              </span>
              <span className="mt-1.5 block text-sm leading-snug text-ink-700">
                {s.attention && <span className="font-semibold text-warn-700">Needs you · </span>}
                {s.note}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
