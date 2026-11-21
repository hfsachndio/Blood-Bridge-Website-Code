import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Users, Clock3, Siren, HeartPulse, LogOut, IdCard, Search } from "lucide-react";
import { Logo } from "../components/Layout";
import { loadDemoCommunity, logOut, setStatus, useDB, type Status, type User } from "../lib/store";
import { Avatar, BloodBadge, Empty, Modal, timeAgo, toast, toastError } from "../components/ui";

export default function Admin() {
  const navigate = useNavigate();
  const db = useDB((d) => d);
  const [tab, setTab] = useState<Status>("pending");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<User | null>(null);
  const [seeding, setSeeding] = useState(false);
  const loadDemo = async () => {
    setSeeding(true);
    try { const r = await loadDemoCommunity(); toast("Demo community loaded", `${r.donors} donors, SOS requests and donation records are now in Firestore for the app and the website.`); }
    catch (e) { toastError((e as Error).message); }
    finally { setSeeding(false); }
  };
  const users = db.users.filter((u) => u.role === "user");
  const list = useMemo(() => users.filter((u) => u.status === tab && `${u.fullName} ${u.email} ${u.cnicNumber ?? ""}`.toLowerCase().includes(q.toLowerCase())), [users, tab, q]);
  const counts = (s: Status) => users.filter((u) => u.status === s).length;
  const decide = (u: User, s: Status) => { setStatus(u.uid, s, s === "approved"); toast(s === "approved" ? `${u.fullName} approved` : `${u.fullName} rejected`, s === "approved" ? "They can now post and respond to requests." : "They've been asked to resubmit their CNIC."); setOpen(null); };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><Logo /><span className="chip bg-gray-900 text-white">Admin</span></div><div className="flex items-center gap-2"><button onClick={() => { void loadDemo(); }} disabled={seeding} className="btn-ghost px-3 py-2 text-xs">{seeding ? "Loading…" : "Load demo community"}</button><button onClick={() => { logOut(); navigate("/"); }} className="btn-ghost px-3 py-2 text-xs"><LogOut className="size-4" />Log out</button></div></div></header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Admin dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Verify donors' CNICs before they can post or respond.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[[Clock3, "Pending verification", counts("pending")], [Users, "Verified users", counts("approved")], [Siren, "Open SOS requests", db.requests.filter((r) => r.status === "open").length], [HeartPulse, "Donations logged", db.records.length]].map(([Icon, l, v]) => {
            const I = Icon as typeof Users; return <div key={l as string} className="card p-4"><I className="size-5 text-brand-600" /><div className="mt-2 text-2xl font-extrabold">{v as number}</div><div className="text-xs text-gray-500">{l as string}</div></div>;
          })}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div role="tablist" className="inline-flex rounded-2xl bg-white p-1 shadow-card">
            {(["pending", "approved", "rejected", "incomplete"] as Status[]).map((s) => <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize ${tab === s ? "bg-gray-900 text-white" : "text-gray-600"}`}>{s} <span className="opacity-60">{counts(s)}</span></button>)}
          </div>
          <div className="relative ml-auto w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or CNIC" aria-label="Search users" className="input pl-9" /></div>
        </div>
        <div className="card mt-4 divide-y divide-gray-100">
          {list.length ? list.map((u) => (
            <div key={u.uid} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar name={u.fullName} />
              <div className="min-w-0 flex-1"><div className="font-semibold">{u.fullName}</div><div className="text-xs text-gray-500">{u.email} · CNIC {u.cnicNumber ?? "—"} · joined {timeAgo(u.createdAt)}</div></div>
              <BloodBadge type={u.bloodType} size="sm" />
              <button onClick={() => setOpen(u)} className="btn-ghost px-3 py-1.5 text-xs"><IdCard className="size-3.5" />Review</button>
              {u.status !== "approved" ? <button onClick={() => decide(u, "approved")} className="btn-primary bg-green-600 px-3 py-1.5 text-xs hover:bg-green-700"><CheckCircle2 className="size-3.5" />Approve</button> : null}
              {u.status !== "rejected" ? <button onClick={() => decide(u, "rejected")} className="btn-ghost px-3 py-1.5 text-xs text-brand-700"><XCircle className="size-3.5" />Reject</button> : null}
            </div>
          )) : <Empty icon={<Users className="size-6" />} title={`No ${tab} users`} />}
        </div>
      </main>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Review CNIC" wide>
        {open ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>{open.cnicImage ? <img src={open.cnicImage} alt="Uploaded CNIC" className="w-full rounded-2xl border" /> : <div className="grid aspect-[1.6] place-items-center rounded-2xl border-2 border-dashed text-sm text-gray-400">No CNIC image uploaded</div>}</div>
            <div className="space-y-2 text-sm">
              {[["Name", open.fullName], ["CNIC", open.cnicNumber ?? "—"], ["CNIC format", /^\d{5}-\d{7}-\d$/.test(open.cnicNumber ?? "") ? "Valid ✓" : "Invalid"], ["AI photo check", !open.cnicCheck ? "Not run" : open.cnicCheck.cnic ? (open.cnicCheck.cnic === open.cnicNumber ? `Number matches ✓ (OCR ${open.cnicCheck.confidence}%)` : `Mismatch: card shows ${open.cnicCheck.cnic}`) : "Number not readable"], ["Photo quality", !open.cnicCheck ? "—" : open.cnicCheck.qualityOk ? "Good" : open.cnicCheck.issues.join(", ")], ["Date of birth", open.dateOfBirth ?? "—"], ["Blood type", open.bloodType ?? "—"], ["Area", open.location ?? "—"], ["Phone", open.phone ?? "—"], ["Status", open.status]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-gray-100 pb-2"><span className="text-gray-500">{k}</span><span className="font-medium">{v}</span></div>)}
              <div className="flex gap-2 pt-3"><button onClick={() => decide(open, "approved")} className="btn-primary flex-1 bg-green-600 hover:bg-green-700">Approve</button><button onClick={() => decide(open, "rejected")} className="btn-ghost flex-1 text-brand-700">Reject</button></div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
