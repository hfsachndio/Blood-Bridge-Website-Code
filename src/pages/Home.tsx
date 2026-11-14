import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Siren, Droplet, CalendarClock, Award, ChevronRight, HeartPulse, Lightbulb, MapPin, Bot } from "lucide-react";
import { BLOOD_TYPES, HOSPITALS, distanceKm, fmtKm, isCompatible, type BloodType } from "../lib/blood";
import { daysUntilNextDonation } from "../lib/eligibility";
import { calcPoints, createRequest, respondToRequest, updateProfile, useCurrentUser, useDB, type SOSRequest } from "../lib/store";
import { BloodBadge, Modal, Priority, Toggle, timeAgo, toast, toastError } from "../components/ui";

const TIPS = [
  "Drink an extra 500 ml of water before donating.",
  "Eat iron-rich food like spinach, lentils and dates after donating.",
  "Bring your CNIC. Blood banks need it to register you.",
  "Whole blood can be donated every 90 days.",
];

export function SOSForm({ onDone, initialType }: { onDone: () => void; initialType?: BloodType }) {
  const me = useCurrentUser()!;
  const [f, setF] = useState({ bloodType: initialType ?? me.bloodType ?? ("" as BloodType | ""), hospital: "", units: "1", priority: "urgent" as SOSRequest["priority"], note: "" });
  const navigate = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.bloodType) return toastError("Choose the blood type needed.");
    if (!f.hospital) return toastError("Choose the hospital.");
    const { notified } = createRequest({ bloodType: f.bloodType, location: f.hospital, hospital: f.hospital, unitsNeeded: Number(f.units), priority: f.priority, note: f.note.trim() });
    toast("SOS sent 🚨", `${notified} compatible donor${notified === 1 ? "" : "s"} nearby were alerted.`);
    onDone(); navigate("/requests");
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><span className="label">Blood type needed</span><div className="grid grid-cols-4 gap-2">{BLOOD_TYPES.map((t) => <button type="button" key={t} aria-pressed={f.bloodType === t} onClick={() => setF({ ...f, bloodType: t })} className={`rounded-xl border py-2.5 text-sm font-bold ${f.bloodType === t ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200"}`}>{t}</button>)}</div></div>
      <div><label className="label" htmlFor="sos-h">Hospital</label><select id="sos-h" className="input" value={f.hospital} onChange={(e) => setF({ ...f, hospital: e.target.value })} required><option value="">Select hospital…</option>{HOSPITALS.map((h) => <option key={h.name}>{h.name}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="sos-u">Units needed</label><select id="sos-u" className="input" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></div>
        <div><span className="label">Urgency</span><div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">{(["critical", "urgent", "normal"] as const).map((p) => <button type="button" key={p} aria-pressed={f.priority === p} onClick={() => setF({ ...f, priority: p })} className={`rounded-lg py-2 text-xs font-semibold capitalize ${f.priority === p ? "bg-white shadow-card" : "text-gray-500"}`}>{p}</button>)}</div></div>
      </div>
      <div><label className="label" htmlFor="sos-n">Note for donors (optional)</label><textarea id="sos-n" className="input h-20 py-2.5" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ward, patient's first name, time window…" /></div>
      <button type="submit" className="btn-primary w-full py-3"><Siren className="size-4" />Send SOS</button>
      <p className="text-center text-xs text-gray-500">Only compatible, available donors within 15 km are alerted. Your number stays hidden.</p>
    </form>
  );
}

export default function Home() {
  const me = useCurrentUser()!;
  const [sos, setSos] = useState(false);
  const navigate = useNavigate();
  const data = useDB((d) => ({ requests: d.requests, posts: d.donations.filter((p) => p.uid === d.session).length, records: d.records.filter((r) => r.donorUid === d.session) }));
  const left = daysUntilNextDonation(me.lastDonationDate);
  const points = calcPoints(data.posts, data.records.length);
  const urgent = useMemo(() => data.requests
    .filter((r) => r.status === "open" && r.uid !== me.uid && me.bloodType && isCompatible(me.bloodType, r.bloodType))
    .map((r) => ({ r, km: me.lat ? distanceKm({ lat: me.lat, lng: me.lng! }, r) : 0 }))
    .sort((a, b) => (a.r.priority === "critical" ? -1 : 0) - (b.r.priority === "critical" ? -1 : 0) || a.km - b.km).slice(0, 4), [data.requests, me]);
  const mine = data.requests.filter((r) => r.uid === me.uid && r.status === "open");
  const respond = (id: string) => { const chat = respondToRequest(id); toast("Thank you! 🙏", "The requester was notified and a chat has started."); if (chat) navigate(`/chat/${chat}`); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm text-gray-500">Assalam o Alaikum,</p><h1 className="text-2xl font-extrabold tracking-tight">{me.fullName.split(" ")[0]} 👋</h1></div>
        <div className="card flex items-center gap-3 px-4 py-3">
          <div className="text-sm"><div className="font-semibold">{me.isAvailable ? "Available to donate" : "Not available"}</div><div className="text-xs text-gray-500">{me.isAvailable ? "You'll get SOS alerts" : "SOS alerts paused"}</div></div>
          <Toggle on={!!me.isAvailable} label="Availability" onChange={(v) => { updateProfile({ isAvailable: v }); toast(v ? "You're available" : "Availability paused"); }} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-lift">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10" />
          <div className="relative">
            <span className="chip bg-white/15 text-white"><Siren className="size-3.5" />Emergency</span>
            <h2 className="mt-3 text-2xl font-extrabold">Need blood urgently?</h2>
            <p className="mt-1 max-w-sm text-white/85">Send an SOS. Compatible donors near the hospital are alerted in seconds.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => setSos(true)} className="btn bg-white px-5 py-3 text-brand-700 hover:bg-brand-50"><Siren className="size-4" />Send SOS</button>
              <Link to="/bot" className="btn border border-white/40 px-5 py-3 text-white hover:bg-white/10"><Bot className="size-4" />Ask BloodBot</Link>
            </div>
            {mine.length ? <Link to="/requests" className="mt-4 inline-flex items-center gap-1 text-sm text-white/90 underline-offset-2 hover:underline">You have {mine.length} open request{mine.length > 1 ? "s" : ""} · {mine.reduce((s, r) => s + r.responders.length, 0)} response(s) <ChevronRight className="size-4" /></Link> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Droplet, label: "Blood type", value: me.bloodType ?? "—", to: "/profile" },
            { icon: HeartPulse, label: "Donations", value: String(data.records.length), to: "/history" },
            { icon: CalendarClock, label: "Next donation", value: left ? `${left} days` : "Now", to: "/eligibility" },
            { icon: Award, label: "Points", value: String(points), to: "/leaderboard" },
          ].map(({ icon: Icon, label, value, to }) => (
            <Link key={label} to={to} className="card flex flex-col justify-between p-4 transition hover:shadow-lift"><Icon className="size-5 text-brand-600" /><div className="mt-3"><div className="text-2xl font-extrabold">{value}</div><div className="text-xs text-gray-500">{label}</div></div></Link>
          ))}
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Urgent requests you can help</h2><Link to="/requests" className="text-sm font-semibold text-brand-600 hover:underline">See all</Link></div>
        {urgent.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {urgent.map(({ r, km }) => {
              const responded = r.responders.includes(me.uid);
              return (
                <div key={r.id} className="card flex min-w-0 items-center gap-3 p-4 sm:gap-4">
                  <BloodBadge type={r.bloodType} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate font-semibold">{r.hospital}</span><Priority p={r.priority} /></div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin className="size-3" />{fmtKm(km)} · {r.unitsNeeded} unit(s) · {timeAgo(r.createdAt)}</div>
                  </div>
                  <button onClick={() => respond(r.id)} disabled={responded || left > 0} title={left > 0 ? `You can donate again in ${left} days` : undefined} className="btn-primary shrink-0 px-3 py-2 text-xs">{responded ? "Responded" : "I can donate"}</button>
                </div>
              );
            })}
          </div>
        ) : <div className="card p-6 text-sm text-gray-500">No open requests match your blood type right now. 🙏</div>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Recent donations</h2><Link to="/history" className="text-sm font-semibold text-brand-600 hover:underline">History</Link></div>
          {data.records.length ? data.records.slice(0, 3).map((r) => (
            <Link key={r.id} to={`/certificate/${r.id}`} className="flex items-center gap-3 border-t border-gray-100 py-3 first:border-0"><BloodBadge type={r.bloodType} size="sm" /><div className="flex-1 text-sm"><div className="font-medium">{r.hospital}</div><div className="text-xs text-gray-500">{new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {r.units} unit</div></div><ChevronRight className="size-4 text-gray-400" /></Link>
          )) : <p className="text-sm text-gray-500">No donations logged yet. <Link to="/log-donation" className="font-semibold text-brand-600">Log your first one</Link> to earn 150 points.</p>}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><Lightbulb className="size-4 text-amber-500" />Donor tips</h2>
          <ul className="space-y-2.5 text-sm text-gray-600">{TIPS.map((t) => <li key={t} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul>
        </section>
      </div>

      <Modal open={sos} onClose={() => setSos(false)} title="Send an SOS request"><SOSForm onDone={() => setSos(false)} /></Modal>
    </div>
  );
}
