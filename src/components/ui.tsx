import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, XCircle } from "lucide-react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* Buttons ---------------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:hover:bg-brand-600",
  secondary: "border border-line bg-white text-brand-800 hover:bg-brand-50",
  ghost: "text-brand-800 hover:bg-brand-100",
  danger: "bg-bad-700 text-white hover:bg-red-800",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    loading?: boolean;
    size?: "sm" | "md";
  }
>(function Button(
  {
    variant = "primary",
    loading = false,
    size = "md",
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
        BUTTON_STYLES[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

/* Containers -------------------------------------------------------------------------------- */

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cx("rounded-xl border border-line bg-white shadow-card", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl text-ink-900 [overflow-wrap:anywhere] md:text-[2.5rem]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-500 md:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl text-ink-900">{children}</h2>
      {aside}
    </div>
  );
}

/* Feedback ---------------------------------------------------------------------------------- */

type Tone = "neutral" | "brand" | "ok" | "warn" | "bad";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-ink-700",
  brand: "bg-brand-50 text-brand-800",
  ok: "bg-ok-50 text-ok-700",
  warn: "bg-warn-50 text-warn-700",
  bad: "bg-bad-50 text-bad-700",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const ALERT_STYLES: Record<
  "info" | "success" | "warning" | "error",
  { box: string; icon: ReactNode }
> = {
  info: {
    box: "border-brand-200 bg-brand-50 text-brand-900",
    icon: <Info size={18} aria-hidden="true" />,
  },
  success: {
    box: "border-emerald-200 bg-ok-50 text-emerald-900",
    icon: <CheckCircle2 size={18} aria-hidden="true" />,
  },
  warning: {
    box: "border-amber-200 bg-warn-50 text-amber-900",
    icon: <AlertTriangle size={18} aria-hidden="true" />,
  },
  error: {
    box: "border-red-200 bg-bad-50 text-red-900",
    icon: <XCircle size={18} aria-hidden="true" />,
  },
};

export function Alert({
  tone = "info",
  children,
  onDismiss,
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const s = ALERT_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex items-start gap-3 rounded-lg border p-3 text-sm", s.box)}
    >
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded px-1 font-semibold underline"
          aria-label="Dismiss message"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-ink-500">
      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-brand-200 bg-white p-8 text-center">
      <h2 className="font-semibold text-ink-900">{title}</h2>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const valueColor = {
    neutral: "text-ink-900",
    brand: "text-brand-700",
    ok: "text-ok-700",
    warn: "text-warn-700",
    bad: "text-bad-700",
  }[tone];
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-ink-500">{label}</p>
      <p className={cx("mt-1 font-display text-4xl font-semibold tabular-nums", valueColor)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full overflow-hidden rounded-full bg-brand-100"
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* Forms ------------------------------------------------------------------------------------- */

const CONTROL =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-slate-500 focus:border-brand-600 disabled:bg-slate-100 disabled:text-ink-500 aria-[invalid=true]:border-bad-700";

type FieldRenderProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: FieldRenderProps) => ReactNode;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-900">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-500">
          {hint}
        </p>
      )}
      <div className="mt-1.5">
        {children({
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-bad-700">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(CONTROL, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cx(CONTROL, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(CONTROL, "min-h-24", className)} {...rest} />;
});

/* Tables ------------------------------------------------------------------------------------ */

/**
 * Tables. Wide tables fold into stacked cards when their own container is narrow (phones, small tablets),
 * so nobody has to swipe sideways to read a row. Matrices with many numeric columns (week-by-dimension
 * heat maps) keep their grid, scroll inside their own region and pin the first column.
 *
 * The folding is pure CSS (see index.css). Table semantics are restated with ARIA roles because browsers
 * drop them once `display` is changed, and each cell is labelled from its column heading.
 */
export function TableWrap({
  children,
  label,
  layout = "cards",
}: {
  children: ReactNode;
  label: string;
  layout?: "cards" | "matrix";
}) {
  const ref = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const table = ref.current;
    if (!table || layout !== "cards") return;
    const apply = () => decorateTable(table);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [layout]);

  return (
    <div
      className={cx(
        "table-wrap relative overflow-x-auto rounded-xl border border-line bg-white shadow-card",
        layout === "matrix" && "matrix-table",
      )}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table
        ref={ref}
        className={cx(
          "w-full border-collapse text-left text-sm",
          layout === "cards" ? "cards-table min-w-[40rem]" : "min-w-[40rem]",
        )}
      >
        {children}
      </table>
    </div>
  );
}

/** Labels every cell with its column heading and restates the table roles for the folded layout. */
function decorateTable(table: HTMLTableElement) {
  const heads = Array.from(table.querySelectorAll("thead th")).map(
    (th) => th.textContent?.trim() ?? "",
  );
  table.setAttribute("role", "table");
  table.querySelectorAll("thead, tbody").forEach((g) => g.setAttribute("role", "rowgroup"));
  table.querySelectorAll("tr").forEach((tr) => tr.setAttribute("role", "row"));
  table.querySelectorAll("th").forEach((th) => th.setAttribute("role", "columnheader"));
  table.querySelectorAll("tbody tr").forEach((tr) => {
    let column = 0;
    Array.from(tr.children).forEach((cell) => {
      const td = cell as HTMLTableCellElement;
      td.setAttribute("role", "cell");
      const label = heads[column] ?? "";
      if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
      const wide =
        (td.textContent?.trim().length ?? 0) > 26 ||
        td.querySelector("select, input, button, textarea") !== null;
      if (td.getAttribute("data-wide") !== (wide ? "1" : "0"))
        td.setAttribute("data-wide", wide ? "1" : "0");
      column += td.colSpan || 1;
    });
  });
}

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th
    scope="col"
    className={cx(
      "whitespace-nowrap border-b border-line bg-brand-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-brand-900",
      className,
    )}
  >
    {children}
  </th>
);

export const Td = ({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) => (
  <td
    colSpan={colSpan}
    className={cx("border-b border-line px-3 py-2.5 align-top text-ink-700", className)}
  >
    {children}
  </td>
);

export { cx };

/** States who can see the information on a screen, so nobody is surprised by who reads it. */
export function VisibilityNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-ink-500">
      <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
