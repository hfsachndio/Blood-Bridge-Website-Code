import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Siren, MessageCircle, ShieldCheck, Award, Info, MapPin, CheckCircle2, XCircle, Users, Plus, Sparkles } from "lucide-react";
import { distanceKm, fmtKm, isCompatible } from "../lib/blood";
import { daysUntilNextDonation } from "../lib/eligibility";
import { closeRequest, markNotificationsRead, openChat, respondToRequest, useCurrentUser, useDB } from "../lib/store";
import { Avatar, BloodBadge, Empty, Modal, PageHead, Priority, timeAgo, toast } from "../components/ui";
import { SOSForm } from "./Home";

const ICON = { sos: Siren, message: MessageCircle, response: Users, verification: ShieldCheck, award: Award, system: Info };

export function Notifications() {
  const list = useDB((d) => d.notifications.filter((n) => n.uid === d.session));
  const [snapshot] = useState(() => new Set(list.filter((n) => !n.isRead).map((n) => n.id)));
  useEffect(() => { if (list.some((n) => !n.isRead)) markNotificationsRead(); }, [list]);
  return (
    <div className="max-w-3xl">
      <PageHead title="Notifications" subtitle="SOS alerts, responses, messages and account updates." />
      <div className="card divide-y divide-gray-100">
        {list.length ? list.map((n) => {
          const Icon = ICON[n.type];
          const body = <><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${n.type === "sos" ? "bg-brand-50 text-brand-600" : "bg-gray-100 text-gray-600"}`}><Icon className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-semibold">{n.title}{snapshot.has(n.id) ? <span className="size-2 rounded-full bg-brand-600" aria-label="New" /> : null}</div><div className="text-sm text-gray-600">{n.body}</div><div className="mt-0.5 text-xs text-gray-400">{timeAgo(n.createdAt)}</div></div></>;
          return n.link ? <Link key={n.id} to={n.link} className="flex gap-3 p-4 hover:bg-gray-50">{body}</Link> : <div key={n.id} className="flex gap-3 p-4">{body}</div>;
        }) : <Empty icon={<Bell className="size-6" />} title="You're all caught up" body="SOS alerts for your blood type and replies to your requests appear here." />}
      </div>
    </div>
  );
}

export function Requests() {
  const me = useCurrentUser()!;
  const navigate = useNavigate();
  const { requests, users } = useDB((d) => ({ requests: d.requests, users: d.users }));
  const [tab, setTab] = useState<"nearby" | "mine">("nearby");
  const [sos, setSos] = useState(false);
  const wait = daysUntilNextDonation(me.lastDonationDate);
  const nearby = useMemo(() => requests.filter((r) => r.status === "open" && r.uid !== me.uid)
    .map((r) => ({ r, km: me.lat ? distanceKm({ lat: me.lat, lng: me.lng! }, r) : 0, ok: !!me.bloodType && isCompatible(me.bloodType, r.bloodType) }))
    .sort((a, b) => Number(b.ok) - Number(a.ok) || a.km - b.km), [requests, me]);
  const mine = requests.filter((r) => r.uid === me.uid);
  const respond = (id: string) => { const chat = respondToRequest(id); toast("Response sent 🙏", "The requester was notified and a chat has started."); if (chat) navigate(`/chat/${chat}`); };

  return (
    <div>
      <PageHead title="Urgent requests" subtitle="Open SOS requests from verified patients and families." right={<button onClick={() => setSos(true)} className="btn-primary"><Plus className="size-4" />New SOS</button>} />
      <div role="tablist" className="mb-4 inline-flex rounded-2xl bg-white p-1 shadow-card">
        {([["nearby", `Near me (${nearby.length})`], ["mine", `My requests (${mine.length})`]] as const).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === t ? "bg-gray-900 text-white" : "text-gray-600"}`}>{l}</button>)}
      </div>
      {tab === "nearby" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {nearby.length ? nearby.map(({ r, km, ok }) => {
            const responded = r.responders.includes(me.uid);
            return (
              <div key={r.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <BloodBadge type={r.bloodType} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.hospital}</span><Priority p={r.priority} /></div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin className="size-3" />{fmtKm(km)} · {r.unitsNeeded} unit(s) · {timeAgo(r.createdAt)} · {r.responders.length} responded</div>
                    {r.note ? <p className="mt-1.5 text-sm text-gray-600">{r.note}</p> : null}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <span className={`text-xs font-medium ${ok ? "text-green-700" : "text-gray-400"}`}>{ok ? `Your ${me.bloodType} is compatible` : `Not compatible with ${me.bloodType ?? "your type"}`}</span>
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/chat/${openChat(me.uid, r.uid)}`)} className="btn-ghost px-3 py-1.5 text-xs"><MessageCircle className="size-3.5" />Message</button>
                    <button onClick={() => respond(r.id)} disabled={!ok || responded || wait > 0} title={wait > 0 ? `You can donate again in ${wait} days` : undefined} className="btn-primary px-3 py-1.5 text-xs">{responded ? "Responded ✓" : "I can donate"}</button>
                  </div>
                </div>
              </div>
            );
          }) : <div className="card md:col-span-2"><Empty icon={<Siren className="size-6" />} title="No open requests" body="When someone near you needs blood, it shows up here." /></div>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {mine.length ? mine.map((r) => (
            <div key={r.id} className={`card p-4 ${r.status !== "open" ? "opacity-70" : ""}`}>
              <div className="flex items-start gap-3"><BloodBadge type={r.bloodType} size="lg" /><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.hospital}</span><Priority p={r.priority} /><span className="chip bg-gray-100 capitalize text-gray-600">{r.status}</span></div><div className="text-xs text-gray-500">{r.unitsNeeded} unit(s) · posted {timeAgo(r.createdAt)}</div></div></div>
              <div className="mt-3"><div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Donors who responded</div>
                {r.responders.length ? r.responders.map((uid) => { const u = users.find((x) => x.uid === uid); return u ? (
                  <div key={uid} className="mt-2 flex items-center gap-2"><Avatar name={u.fullName} size={30} /><span className="flex-1 text-sm">{u.fullName} · {u.bloodType}</span><button onClick={() => navigate(`/chat/${openChat(me.uid, uid)}`)} className="btn-soft px-2.5 py-1 text-xs">Chat</button></div>
                ) : null; }) : <p className="mt-1 text-sm text-gray-500">Waiting for donors… you'll be notified.</p>}
              </div>
              {r.aiRanking?.length ? <div className="mt-3 rounded-xl bg-violet-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700"><Sparkles className="size-3.5" />AI-ranked donors alerted first</div>
                {r.aiRanking.map((d) => (
                  <div key={d.uid} className="mt-1.5 flex items-center gap-2 text-sm"><span className="flex-1 truncate">{d.name.split(" ")[0]} {d.name.split(" ")[1]?.[0]}. · {d.bloodType} · {d.km} km</span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-violet-100"><span className="block h-full bg-violet-500" style={{ width: `${Math.round(d.p * 100)}%` }} /></span><span className="w-9 text-right text-xs font-semibold text-violet-700">{Math.round(d.p * 100)}%</span></div>
                ))}
                <p className="mt-1.5 text-[11px] text-violet-700/80">Chance of responding within an hour, from a neural network trained on 30,000 SOS alerts.</p>
              </div> : null}
              {r.status === "open" ? <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3"><button onClick={() => { closeRequest(r.id, "fulfilled"); toast("Marked as fulfilled", "Thank you for updating the community."); }} className="btn-soft px-3 py-1.5 text-xs"><CheckCircle2 className="size-3.5" />Fulfilled</button><button onClick={() => { closeRequest(r.id, "closed"); toast("Request closed"); }} className="btn-ghost px-3 py-1.5 text-xs"><XCircle className="size-3.5" />Close</button></div> : null}
            </div>
          )) : <div className="card md:col-span-2"><Empty icon={<Siren className="size-6" />} title="You haven't posted a request" action={<button onClick={() => setSos(true)} className="btn-primary">Send an SOS</button>} /></div>}
        </div>
      )}
      <Modal open={sos} onClose={() => setSos(false)} title="Send an SOS request"><SOSForm onDone={() => { setSos(false); setTab("mine"); }} /></Modal>
    </div>
  );
}
