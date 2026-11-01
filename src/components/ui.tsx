import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "good" | "bad" | "warn" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  good: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  bad: "bg-red-50 text-red-800 ring-1 ring-red-200",
  warn: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  info: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children?: ReactNode }) {
  const map = {
    info: ["border-indigo-200 bg-indigo-50 text-indigo-900", Info],
    warn: ["border-amber-200 bg-amber-50 text-amber-900", AlertTriangle],
    error: ["border-red-200 bg-red-50 text-red-900", XCircle],
    success: ["border-emerald-200 bg-emerald-50 text-emerald-900", CheckCircle2],
  } as const;
  const [cls, Icon] = map[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-lg border p-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}

export const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`);

export function scoreTone(v: number | null): Tone {
  if (v === null) return "neutral";
  return v >= 0.75 ? "good" : v >= 0.45 ? "warn" : "bad";
}

export function MetricCard(props: { title: string; value: number | null; tag: string; description: string; unavailableReason?: string }) {
  const { title, value, tag, description, unavailableReason } = props;
  const bar = value === null ? "bg-slate-300" : value >= 0.75 ? "bg-emerald-500" : value >= 0.45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="card" data-testid={`metric-${title}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">{title}</h3>
        <Badge tone={tag === "Deterministic" ? "neutral" : tag === "LLM-assisted" ? "info" : "neutral"}>{tag}</Badge>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value === null ? "Unavailable" : pct(value)}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{value === null && unavailableReason ? unavailableReason : description}</p>
    </div>
  );
}
