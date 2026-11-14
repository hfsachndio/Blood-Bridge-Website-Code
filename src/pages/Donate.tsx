import { lazy, Suspense, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { HeartHandshake, MapPin, ClipboardCheck, XCircle } from "lucide-react";
import { AREAS, BLOOD_TYPES, HOSPITALS, distanceKm, type BloodType } from "../lib/blood";
import { daysUntilNextDonation } from "../lib/eligibility";
import { closeDonationPost, createDonationPost, useCurrentUser, useDB } from "../lib/store";
import { BloodBadge, PageHead, timeAgo, toast, toastError } from "../components/ui";

const MapView = lazy(() => import("../components/MapView"));

export default function Donate() {
  const me = useCurrentUser()!;
  const myPosts = useDB((d) => d.donations.filter((p) => p.uid === d.session));
  const [f, setF] = useState({ bloodType: (me.bloodType ?? "") as BloodType | "", location: me.location ?? "", hospital: "", note: "" });
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(null);
  const wait = daysUntilNextDonation(me.lastDonationDate);
  const area = AREAS.find((a) => a.name === f.location) ?? AREAS[0]!;

  const onPick = (lat: number, lng: number) => {
    setPick({ lat, lng });
    const nearest = [...AREAS].sort((a, b) => distanceKm({ lat, lng }, a) - distanceKm({ lat, lng }, b))[0]!;
    setF((x) => ({ ...x, location: nearest.name }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.bloodType || !f.location || !f.hospital) return toastError("Please fill in blood type, area and hospital.");
    createDonationPost({ bloodType: f.bloodType, location: f.location, hospital: f.hospital, note: f.note.trim() });
    toast("Donation offer posted 💙", "+100 points. Patients nearby can now message you.");
    setF({ ...f, note: "" });
  };

  return (
    <div>
      <PageHead title="Offer to donate" subtitle="Post when and where you can give. Patients near you can message you privately." right={<Link to="/log-donation" className="btn-ghost"><ClipboardCheck className="size-4" />Log a donation</Link>} />
      {wait > 0 ? <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Your last donation was recent. You can donate again in <b>{wait} days</b>. You can still post an offer for a later date.</div> : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <form onSubmit={submit} className="card space-y-4 p-5">
          <div><span className="label">Your blood type</span><div className="grid grid-cols-4 gap-2">{BLOOD_TYPES.map((t) => <button type="button" key={t} aria-pressed={f.bloodType === t} onClick={() => setF({ ...f, bloodType: t })} className={`rounded-xl border py-2.5 text-sm font-bold ${f.bloodType === t ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200"}`}>{t}</button>)}</div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Area</span><select className="input" value={f.location} onChange={(e) => { setF({ ...f, location: e.target.value }); setPick(null); }} required><option value="">Select…</option>{AREAS.map((a) => <option key={a.name}>{a.name}</option>)}</select></label>
            <label><span className="label">Preferred hospital</span><select className="input" value={f.hospital} onChange={(e) => setF({ ...f, hospital: e.target.value })} required><option value="">Select…</option>{HOSPITALS.map((h) => <option key={h.name}>{h.name}</option>)}</select></label>
          </div>
          <label className="block"><span className="label">Note (availability, timings)</span><textarea className="input h-24 py-2.5" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Available weekdays after 5 pm" /></label>
          <button type="submit" className="btn-primary w-full py-3"><HeartHandshake className="size-4" />Post donation offer</button>
        </form>
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm text-gray-500"><MapPin className="size-4" />Tap the map to set your area{pick ? `: ${f.location}` : ""}</div>
          <Suspense fallback={<div className="grid h-[360px] place-items-center rounded-2xl bg-gray-100 text-sm text-gray-500">Loading map…</div>}>
            <MapView center={pick ?? area} height={360} onPick={onPick} pins={[{ id: "pick", lat: (pick ?? area).lat, lng: (pick ?? area).lng, label: f.bloodType || "?", kind: "pick" }]} />
          </Suspense>
        </div>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">Your offers</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {myPosts.length ? myPosts.map((p) => (
          <div key={p.id} className={`card flex items-start gap-3 p-4 ${p.status === "closed" ? "opacity-60" : ""}`}>
            <BloodBadge type={p.bloodType} />
            <div className="min-w-0 flex-1"><div className="font-semibold">{p.hospital}</div><div className="text-xs text-gray-500">{p.location} · {timeAgo(p.createdAt)} · {p.status}</div>{p.note ? <p className="mt-1 text-sm text-gray-600">{p.note}</p> : null}</div>
            {p.status === "active" ? <button onClick={() => { closeDonationPost(p.id); toast("Offer closed"); }} className="btn-ghost px-3 py-1.5 text-xs"><XCircle className="size-3.5" />Close</button> : null}
          </div>
        )) : <p className="text-sm text-gray-500">You haven't posted an offer yet.</p>}
      </div>
    </div>
  );
}
