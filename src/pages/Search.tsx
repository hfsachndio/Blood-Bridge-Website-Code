import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageCircle, MapPin, Building2, Users, HeartHandshake, Search as SearchIcon } from "lucide-react";
import { AREAS, BLOOD_BANKS, BLOOD_TYPES, distanceKm, findPlace, fmtKm, isCompatible, type BloodType } from "../lib/blood";
import { daysUntilNextDonation } from "../lib/eligibility";
import { openChat, useCurrentUser, useDB } from "../lib/store";
import { Avatar, BloodBadge, Empty, PageHead, timeAgo } from "../components/ui";
import type { Pin } from "../components/MapView";

const MapView = lazy(() => import("../components/MapView"));
type View = "donors" | "posts" | "banks";

export default function Search() {
  const me = useCurrentUser()!;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<BloodType | "all">((params.get("type") as BloodType) || "all");
  const [compatible, setCompatible] = useState(true);
  const [radius, setRadius] = useState(10);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [area, setArea] = useState(me.location ?? "Saddar");
  const [view, setView] = useState<View>("donors");
  const [q, setQ] = useState("");
  const center = findPlace(area) ?? { lat: me.lat ?? 24.86, lng: me.lng ?? 67.03 };
  const db = useDB((d) => d);

  const matchType = (bt?: BloodType) => type === "all" || (!!bt && (compatible ? isCompatible(bt, type) : bt === type));
  const donors = useMemo(() => db.users
    .filter((u) => u.role === "user" && u.status === "approved" && u.uid !== me.uid && u.lat && matchType(u.bloodType) && (!onlyAvailable || u.isAvailable) && u.fullName.toLowerCase().includes(q.toLowerCase()))
    .map((u) => ({ u, km: distanceKm(center, { lat: u.lat!, lng: u.lng! }) })).filter((x) => x.km <= radius).sort((a, b) => a.km - b.km),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [db, type, compatible, radius, onlyAvailable, area, q]);
  const posts = useMemo(() => db.donations
    .filter((p) => p.status === "active" && p.uid !== me.uid && matchType(p.bloodType))
    .map((p) => ({ p, km: distanceKm(center, p) })).filter((x) => x.km <= radius).sort((a, b) => a.km - b.km),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [db, type, compatible, radius, area]);
  const banks = BLOOD_BANKS.map((b) => ({ b, km: distanceKm(center, b) })).sort((a, b) => a.km - b.km);

  const pins: Pin[] = [
    { id: "me", lat: center.lat, lng: center.lng, label: "•", kind: "me", popup: <b>{area}</b> },
    ...(view === "donors" ? donors.map(({ u, km }) => ({ id: u.uid, lat: u.lat!, lng: u.lng!, label: u.bloodType!, kind: "donor" as const, popup: <div><b>{u.fullName.split(" ")[0]} {u.fullName.split(" ")[1]?.[0]}.</b><br />{u.bloodType} · {fmtKm(km)}</div> })) : []),
    ...(view === "posts" ? posts.map(({ p, km }) => ({ id: p.id, lat: p.lat, lng: p.lng, label: p.bloodType, kind: "post" as const, popup: <div><b>{p.name}</b><br />{p.hospital} · {fmtKm(km)}</div> })) : []),
    ...(view === "banks" ? banks.map(({ b, km }) => ({ id: b.name, lat: b.lat, lng: b.lng, label: "BB", kind: "bank" as const, popup: <div><b>{b.name}</b><br />{fmtKm(km)}</div> })) : []),
  ];
  const chat = (uid: string) => navigate(`/chat/${openChat(me.uid, uid)}`);
  const setT = (t: BloodType | "all") => { setType(t); setParams(t === "all" ? {} : { type: t }, { replace: true }); };

  return (
    <div>
      <PageHead title="Find donors" subtitle="Verified donors, donation offers and blood banks near you." />
      <div className="card mb-4 space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Blood type needed">
          {(["all", ...BLOOD_TYPES] as const).map((t) => <button key={t} aria-pressed={type === t} onClick={() => setT(t)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${type === t ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{t === "all" ? "All types" : t}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm"><span className="label">Search near</span><select className="input" value={area} onChange={(e) => setArea(e.target.value)}>{AREAS.map((a) => <option key={a.name}>{a.name}</option>)}</select></label>
          <label className="text-sm"><span className="label">Distance: {radius} km</span><input type="range" min={2} max={30} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="mt-3 w-full accent-brand-600" /></label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={compatible} onChange={(e) => setCompatible(e.target.checked)} className="size-4 accent-brand-600" />Include compatible types</label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="size-4 accent-brand-600" />Available donors only</label>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-2xl bg-white p-1 shadow-card">
          {([["donors", "Donors", Users, donors.length], ["posts", "Offers", HeartHandshake, posts.length], ["banks", "Blood banks", Building2, banks.length]] as const).map(([v, l, Icon, n]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold ${view === v ? "bg-gray-900 text-white" : "text-gray-600"}`}><Icon className="size-4" />{l}<span className="opacity-70">{n}</span></button>
          ))}
        </div>
        {view === "donors" ? <div className="relative ml-auto w-full sm:w-64"><SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search donors by name" className="input pl-9" /></div> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Suspense fallback={<div className="grid h-[420px] place-items-center rounded-2xl bg-gray-100 text-sm text-gray-500">Loading map…</div>}>
          <MapView pins={pins} center={center} radiusKm={view === "banks" ? undefined : radius} height={460} />
        </Suspense>
        <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
          {view === "donors" && (donors.length ? donors.map(({ u, km }) => {
            const wait = daysUntilNextDonation(u.lastDonationDate);
            return (
              <div key={u.uid} className="card flex items-center gap-3 p-3">
                <Avatar name={u.fullName} />
                <div className="min-w-0 flex-1"><div className="font-semibold">{u.fullName.split(" ")[0]} {u.fullName.split(" ")[1]?.[0]}. {u.cnicVerified ? <span className="chip ml-1 bg-green-50 px-1.5 py-0 text-[10px] text-green-700">Verified</span> : null}</div><div className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="size-3" />{u.location} · {fmtKm(km)} · {u.totalDonations ?? 0} donations{wait ? ` · eligible in ${wait}d` : ""}</div></div>
                <BloodBadge type={u.bloodType} size="sm" />
                <button onClick={() => chat(u.uid)} aria-label={`Chat with ${u.fullName.split(" ")[0]}`} className="btn-soft size-9 p-0"><MessageCircle className="size-4" /></button>
              </div>
            );
          }) : <div className="card"><Empty icon={<Users className="size-6" />} title="No donors in range" body="Widen the distance, include compatible types or send an SOS." /></div>)}
          {view === "posts" && (posts.length ? posts.map(({ p, km }) => (
            <div key={p.id} className="card p-3">
              <div className="flex items-center gap-3"><BloodBadge type={p.bloodType} size="sm" /><div className="min-w-0 flex-1"><div className="font-semibold">{p.name.split(" ")[0]} {p.name.split(" ")[1]?.[0]}.</div><div className="text-xs text-gray-500">{p.hospital} · {fmtKm(km)} · {timeAgo(p.createdAt)}</div></div><button onClick={() => chat(p.uid)} className="btn-soft px-3 py-1.5 text-xs"><MessageCircle className="size-3.5" />Chat</button></div>
              {p.note ? <p className="mt-2 text-sm text-gray-600">{p.note}</p> : null}
            </div>
          )) : <div className="card"><Empty icon={<HeartHandshake className="size-6" />} title="No donation offers in range" /></div>)}
          {view === "banks" && banks.map(({ b, km }) => (
            <div key={b.name} className="card flex items-center gap-3 p-3"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Building2 className="size-5" /></span><div className="flex-1"><div className="font-semibold">{b.name}</div><div className="text-xs text-gray-500">{fmtKm(km)} from {area}</div></div><a href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`} target="_blank" rel="noopener" className="btn-ghost px-3 py-1.5 text-xs">Directions</a></div>
          ))}
        </div>
      </div>
    </div>
  );
}
