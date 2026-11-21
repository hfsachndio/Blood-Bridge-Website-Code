import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck, User as UserIcon } from "lucide-react";
import { Logo } from "../components/Layout";
import { lastPage, logIn, requestPasswordReset, signUp } from "../lib/store";
import { toast, toastError } from "../components/ui";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 p-10 text-white lg:flex lg:flex-col">
        <Logo light />
        <div className="mt-auto max-w-md">
          <p className="text-3xl font-extrabold leading-tight">"Finding a donor shouldn't take hours."</p>
          <p className="mt-4 text-white/80">Blood Bridge alerts compatible donors near the hospital within seconds, and keeps everyone's number private.</p>
        </div>
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10" />
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden"><Logo /></div>
          <h1 className="mt-8 text-3xl font-extrabold tracking-tight lg:mt-0">{title}</h1>
          <p className="mt-1 text-gray-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Password({ value, onChange, label = "Password", id = "password", autoComplete }: { value: string; onChange: (v: string) => void; label?: string; id?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} className="input pr-11" autoComplete={autoComplete} required minLength={6} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-gray-500 hover:bg-gray-100">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
      </div>
    </div>
  );
}

export function Login() {
  const [params] = useSearchParams();
  const [role, setRole] = useState<"user" | "admin">("user");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const u = await logIn(email, password, role === "admin");
      toast(`Welcome back, ${u.fullName.split(" ")[0]}!`);
      navigate(lastPage(u)); // continue where this user left off
    } catch (err) { toastError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Shell title="Log in" subtitle="Welcome back to Blood Bridge.">
      <div role="tablist" className="mb-6 grid grid-cols-2 rounded-2xl bg-gray-100 p-1">
        {([["user", "Donor / patient", UserIcon], ["admin", "Admin", ShieldCheck]] as const).map(([r, label, Icon]) => (
          <button key={r} role="tab" aria-selected={role === r} onClick={() => setRole(r)} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${role === r ? "bg-white shadow-card" : "text-gray-500"}`}><Icon className="size-4" />{label}</button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" required /></div>
        <Password value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">Forgot password?</Link></div>
        <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">{busy ? "Logging in…" : "Log in"}</button>
      </form>
      {role === "user" ? <p className="mt-6 text-center text-sm text-gray-500">New to Blood Bridge? <Link to="/signup" className="font-semibold text-brand-600 hover:underline">Create an account</Link></p> : null}
    </Shell>
  );
}

export function Signup() {
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", confirm: "" });
  const [agree, setAgree] = useState(false);
  const navigate = useNavigate();
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) return toastError("Use at least 8 characters for your password.");
    if (form.password !== form.confirm) return toastError("Passwords do not match.");
    if (!/^03\d{2}-?\d{7}$/.test(form.phone.replace(/\s/g, ""))) return toastError("Enter a Pakistani mobile number, e.g. 0300-1234567.");
    if (!agree) return toastError("Please accept the privacy terms to continue.");
    setBusy(true);
    try { const u = await signUp(form.fullName, form.email, form.password, form.phone); if (u.role === "admin") { toast("Admin account created"); navigate("/admin"); } else { toast("Account created", "Now complete your donor profile."); navigate("/profile/setup"); } }
    catch (err) { toastError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Shell title="Create your account" subtitle="It takes about two minutes.">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label" htmlFor="name">Full name</label><input id="name" value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} className="input" autoComplete="name" required minLength={3} /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} className="input" autoComplete="email" required /></div>
        <div><label className="label" htmlFor="phone">Mobile number</label><input id="phone" value={form.phone} onChange={(e) => set("phone")(e.target.value)} className="input" placeholder="0300-1234567" autoComplete="tel" required /><p className="mt-1 text-xs text-gray-500">Never shown to other users.</p></div>
        <Password value={form.password} onChange={set("password")} autoComplete="new-password" />
        <Password value={form.confirm} onChange={set("confirm")} label="Confirm password" id="confirm" autoComplete="new-password" />
        <label className="flex items-start gap-2.5 text-sm text-gray-600"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />I agree that my details are shared with patients only when I choose to, through in-app chat.</label>
        <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">Already have an account? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link></p>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); try { await requestPasswordReset(email); setSent(true); } catch (err) { toastError((err as Error).message); } };
  return (
    <Shell title="Reset your password" subtitle="We'll email you a reset link.">
      {sent ? (
        <div className="rounded-2xl bg-green-50 p-5 text-sm text-green-800"><b>Check your inbox.</b> If an account exists for {email}, a reset link is on its way. (Demo: no email is actually sent.)<div className="mt-4"><Link to="/login" className="btn-primary">Back to log in</Link></div></div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required /></div>
          <button type="submit" className="btn-primary w-full py-3">Send reset link</button>
          <p className="text-center text-sm"><Link to="/login" className="font-medium text-brand-600 hover:underline">Back to log in</Link></p>
        </form>
      )}
    </Shell>
  );
}
