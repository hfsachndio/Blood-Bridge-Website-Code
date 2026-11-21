import { Link, useNavigate } from "react-router-dom";
import { Pencil, LogOut, ShieldCheck, HeartPulse, History, ClipboardCheck, Bot, ChevronRight, MapPin, Phone, Mail, Calendar, Weight } from "lucide-react";
import { daysUntilNextDonation } from "../lib/eligibility";
import { calcPoints, logOut, updateProfile, useCurrentUser, useDB } from "../lib/store";
import { Avatar, BloodBadge, PageHead, Toggle, toast } from "../components/ui";
import { ProfileForm } from "./ProfileSetup";

export default function Profile() {
  const me = useCurrentUser()!;
  const navigate = useNavigate();
  const stats = useDB((d) => ({ posts: d.donations.filter((p) => p.uid === d.session).length, records: d.records.filter((r) => r.donorUid === d.session).length }));
  const wait = daysUntilNextDonation(me.lastDonationDate);
  const age = me.dateOfBirth ? Math.floor((Date.now() - new Date(me.dateOfBirth).getTime()) / 31557600000) : null;
  const links = [
    { to: "/eligibility", icon: HeartPulse, label: "Eligibility checker", hint: wait ? `Eligible in ${wait} days` : "You can donate now" },
    { to: "/history", icon: History, label: "Donation history & certificates", hint: `${stats.records} donations` },
    { to: "/log-donation", icon: ClipboardCheck, label: "Log a donation", hint: "+150 points" },
    { to: "/bot", icon: Bot, label: "BloodBot assistant", hint: "Ask anything" },
  ];
  return (
    <div>
      <PageHead title="Profile" right={<Link to="/profile/edit" className="btn-ghost"><Pencil className="size-4" />Edit profile</Link>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div className="card p-6 text-center">
            <div className="flex justify-center"><Avatar name={me.fullName} size={84} /></div>
            <h2 className="mt-3 text-xl font-extrabold">{me.fullName}</h2>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-sm text-gray-500"><ShieldCheck className="size-4 text-green-600" />{me.cnicVerified ? "CNIC verified" : "Verification pending"}</div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center"><BloodBadge type={me.bloodType} /><span className="mt-1 text-xs text-gray-500">Blood type</span></div>
              <div><div className="text-2xl font-extrabold">{stats.records}</div><span className="text-xs text-gray-500">Donations</span></div>
              <div><div className="text-2xl font-extrabold">{calcPoints(stats.posts, stats.records)}</div><span className="text-xs text-gray-500">Points</span></div>
            </div>
          </div>
          <div className="card flex items-center justify-between gap-3 p-4">
            <div><div className="font-semibold">Available to donate</div><div className="text-xs text-gray-500">Receive SOS alerts for compatible requests near you</div></div>
            <Toggle on={!!me.isAvailable} label="Available to donate" onChange={(v) => { updateProfile({ isAvailable: v }); toast(v ? "You're available" : "Availability paused"); }} />
          </div>
          <div className="card divide-y divide-gray-100 text-sm">
            {[[Mail, me.email], [Phone, me.phone ? `${me.phone} · hidden from others` : "Not added"], [MapPin, me.location ?? "—"], [Calendar, age !== null ? `${age} years` : "—"], [Weight, me.weight ? `${me.weight} kg` : "—"]].map(([Icon, v], i) => {
              const I = Icon as typeof Mail; return <div key={i} className="flex items-center gap-3 p-3.5"><I className="size-4 text-gray-400" />{v as string}</div>;
            })}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card divide-y divide-gray-100">
            {links.map(({ to, icon: Icon, label, hint }) => (
              <Link key={to} to={to} className="flex items-center gap-3 p-4 hover:bg-gray-50"><span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-5" /></span><div className="flex-1"><div className="font-semibold">{label}</div><div className="text-xs text-gray-500">{hint}</div></div><ChevronRight className="size-4 text-gray-400" /></Link>
            ))}
          </div>
          <div className="card space-y-2 p-4">
            <button onClick={() => { logOut(); toast("Logged out"); navigate("/"); }} className="btn-ghost w-full"><LogOut className="size-4" />Log out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileEdit() {
  const me = useCurrentUser()!;
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl">
      <PageHead title="Edit profile" subtitle="Changes to your blood type or CNIC are visible to administrators." />
      <ProfileForm me={me} mode="edit" onDone={() => navigate("/profile")} />
    </div>
  );
}
