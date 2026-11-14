import { useEffect, useState, type ReactNode } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

// ---------- toasts ----------
type Toast = { id: number; kind: "success" | "error" | "info"; title: string; body?: string };
let toasts: Toast[] = [];
const subs = new Set<(t: Toast[]) => void>();
export function toast(title: string, body?: string, kind: Toast["kind"] = "success") {
  const t: Toast = { id: Date.now() + Math.random(), kind, title, ...(body ? { body } : {}) };
  toasts = [...toasts, t]; subs.forEach((s) => s(toasts));
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); subs.forEach((s) => s(toasts)); }, 3800);
}
export const toastError = (title: string, body?: string) => toast(title, body, "error");
export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => { subs.add(setList); return () => { subs.delete(setList); }; }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-5">
      {list.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-lift">
          {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" /> : t.kind === "error" ? <AlertCircle className="mt-0.5 size-5 shrink-0 text-brand-600" /> : <Info className="mt-0.5 size-5 shrink-0 text-blue-600" />}
          <div className="min-w-0"><div className="text-sm font-semibold">{t.title}</div>{t.body ? <div className="mt-0.5 text-sm text-gray-500">{t.body}</div> : null}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- modal ----------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-gray-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-lift sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-gray-100"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- small pieces ----------
export const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const palette = ["bg-orange-500", "bg-blue-600", "bg-emerald-600", "bg-violet-600", "bg-pink-600", "bg-amber-500", "bg-cyan-600"];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const c = palette[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % palette.length];
  return <span className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${c}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</span>;
}
export function BloodBadge({ type, size = "md" }: { type?: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-14 min-w-14 text-xl" : size === "sm" ? "h-7 min-w-7 text-[11px]" : "h-10 min-w-10 text-sm";
  return <span className={`grid place-items-center rounded-xl bg-brand-600 px-1.5 font-extrabold text-white ${cls}`}>{type ?? "?"}</span>;
}
export function Priority({ p }: { p: string }) {
  const cls = p === "critical" ? "bg-brand-600 text-white" : p === "urgent" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600";
  return <span className={`chip ${cls} capitalize`}>{p}</span>;
}
export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <div className="mt-3 font-semibold">{title}</div>
      {body ? <p className="mt-1 max-w-sm text-sm text-gray-500">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
export function PageHead({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>{subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}</div>
      {right}
    </div>
  );
}
export const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400); return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
/** Renders **bold** and line breaks from bot/plain text safely. */
export function RichText({ text }: { text: string }) {
  return <>{text.split("\n").map((line, i) => <p key={i} className={i ? "mt-1" : ""}>{line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>)}</p>)}</>;
}
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-green-500" : "bg-gray-300"}`}>
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}
