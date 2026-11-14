import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Award, ClipboardCheck, Download, History as HistoryIcon, Printer } from "lucide-react";
import { HOSPITALS, BLOOD_BANKS } from "../lib/blood";
import { daysUntilNextDonation } from "../lib/eligibility";
import { logDonation, useCurrentUser, useDB } from "../lib/store";
import { BloodBadge, Empty, PageHead, toast, toastError } from "../components/ui";
import { Logo } from "../components/Layout";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function History() {
  const records = useDB((d) => d.records.filter((r) => r.donorUid === d.session));
  const units = records.reduce((s, r) => s + r.units, 0);
  return (
    <div className="max-w-4xl">
      <PageHead title="Donation history" subtitle={`${records.length} donations · ${units} unit(s) · up to ${units * 3} lives helped`} right={<Link to="/log-donation" className="btn-primary"><ClipboardCheck className="size-4" />Log donation</Link>} />
      <div className="card divide-y divide-gray-100">
        {records.length ? records.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4">
            <BloodBadge type={r.bloodType} />
            <div className="min-w-0 flex-1"><div className="font-semibold">{r.hospital}</div><div className="text-xs text-gray-500">{fmt(r.date)} · {r.units} unit(s){r.recipient ? ` · for ${r.recipient}` : ""} · {r.certificateNo}</div></div>
            <Link to={`/certificate/${r.id}`} className="btn-ghost px-3 py-1.5 text-xs"><Award className="size-3.5" />Certificate</Link>
          </div>
        )) : <Empty icon={<HistoryIcon className="size-6" />} title="No donations yet" body="Log a donation after you give blood to earn points and a certificate." action={<Link to="/log-donation" className="btn-primary">Log a donation</Link>} />}
      </div>
    </div>
  );
}

export function LogDonation() {
  const me = useCurrentUser()!;
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ hospital: "", units: "1", date: today, recipient: "", confirm: false });
  const wait = daysUntilNextDonation(me.lastDonationDate);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.hospital) return toastError("Choose where you donated.");
    if (!f.confirm) return toastError("Please confirm the donation is genuine.");
    try {
      const rec = logDonation({ hospital: f.hospital, units: Number(f.units), date: f.date, ...(f.recipient.trim() ? { recipient: f.recipient.trim() } : {}) });
      toast("Donation logged 🩸", "+150 points. Your certificate is ready.");
      navigate(`/certificate/${rec.id}`);
    } catch (err) { toastError((err as Error).message); }
  };
  return (
    <div className="max-w-2xl">
      <PageHead title="Log a donation" subtitle="Record a donation you've made to update your history and earn points." />
      {wait > 0 ? <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Your profile shows a donation {90 - wait} days ago. Whole blood needs a 90-day gap; only log donations that actually happened.</div> : null}
      <form onSubmit={submit} className="card space-y-4 p-5">
        <label className="block"><span className="label">Where did you donate?</span><select className="input" value={f.hospital} onChange={(e) => setF({ ...f, hospital: e.target.value })} required><option value="">Select…</option><optgroup label="Hospitals">{HOSPITALS.map((h) => <option key={h.name}>{h.name}</option>)}</optgroup><optgroup label="Blood banks">{BLOOD_BANKS.map((h) => <option key={h.name}>{h.name}</option>)}</optgroup></select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="label">Date</span><input type="date" className="input" value={f.date} max={today} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
          <label><span className="label">Units</span><select className="input" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })}><option>1</option><option>2</option></select></label>
        </div>
        <label className="block"><span className="label">Recipient (optional)</span><input className="input" value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })} placeholder="e.g. Patient at ward 4, or 'general stock'" /></label>
        <label className="flex items-start gap-2.5 text-sm text-gray-600"><input type="checkbox" checked={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.checked })} className="mt-0.5 size-4 accent-brand-600" />I confirm I donated blood on this date. False records can lead to account suspension.</label>
        <button type="submit" className="btn-primary w-full py-3">Save donation</button>
      </form>
    </div>
  );
}

export function Certificate() {
  const { id = "" } = useParams();
  const rec = useDB((d) => d.records.find((r) => r.id === id));
  if (!rec) return <Navigate to="/history" replace />;
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden"><Link to="/history" className="text-sm font-semibold text-brand-600 hover:underline">← Donation history</Link><div className="flex gap-2"><button onClick={() => window.print()} className="btn-ghost"><Printer className="size-4" />Print</button><button onClick={() => { window.print(); }} className="btn-primary"><Download className="size-4" />Save as PDF</button></div></div>
      <div className="relative overflow-hidden rounded-3xl border-4 border-double border-brand-200 bg-white p-8 text-center shadow-lift sm:p-12">
        <div className="absolute -left-16 -top-16 size-48 rounded-full bg-brand-50" /><div className="absolute -bottom-16 -right-16 size-48 rounded-full bg-brand-50" />
        <div className="relative">
          <div className="flex justify-center"><Logo /></div>
          <div className="mt-8 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Certificate of appreciation</div>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{rec.donorName}</h1>
          <p className="mx-auto mt-4 max-w-lg text-gray-600">for voluntarily donating <b>{rec.units} unit{rec.units > 1 ? "s" : ""}</b> of <b>{rec.bloodType}</b> blood at <b>{rec.hospital}</b> on <b>{fmt(rec.date)}</b>. Your gift can help save up to {rec.units * 3} lives.</p>
          <div className="mt-8 flex items-center justify-center gap-10 text-sm">
            <div><div className="font-mono font-semibold">{rec.certificateNo}</div><div className="text-xs text-gray-400">Certificate no.</div></div>
            <BloodBadge type={rec.bloodType} size="lg" />
            <div><div className="font-semibold">Blood Bridge</div><div className="text-xs text-gray-400">Karachi, Pakistan</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
