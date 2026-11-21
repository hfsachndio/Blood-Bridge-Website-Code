import { Link } from "react-router-dom";
import { Siren, MapPin, ShieldCheck, MessageCircle, Trophy, Bot, HeartPulse, ArrowRight, Lock } from "lucide-react";
import { Logo, BotLauncher } from "../components/Layout";
import { useCurrentUser, useDB } from "../lib/store";

const features = [
  { icon: Siren, title: "Emergency SOS", body: "Post a request in seconds. Compatible, available donors within 15 km are alerted instantly." },
  { icon: MapPin, title: "Map search", body: "Find verified donors and blood banks on a live map, filtered by blood type, distance and availability." },
  { icon: ShieldCheck, title: "Verified donors", body: "Every account is CNIC-checked and approved by an administrator before it can post or respond." },
  { icon: Lock, title: "Privacy first", body: "Phone numbers stay hidden. Patients and donors talk through in-app chat and share details only by choice." },
  { icon: HeartPulse, title: "Eligibility checker", body: "WHO-based rules for age, weight, health and donation gaps tell donors exactly when they can give." },
  { icon: Trophy, title: "Rewards", body: "Points, badges and a leaderboard recognise regular donors and keep them coming back." },
];

export default function Landing() {
  const me = useCurrentUser();
  const stats = useDB((d) => (!d.session && d.stats ? { donors: d.stats.donors, open: d.stats.requests, donations: d.stats.records } : {
    donors: d.users.filter((u) => u.role === "user" && u.status === "approved").length,
    open: d.requests.filter((r) => r.status === "open").length,
    donations: d.records.length,
  }));
  const appLink = me ? (me.role === "admin" ? "/admin" : "/app") : "/signup";
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {me ? <Link to={appLink} className="btn-primary">Open app</Link> : <><Link to="/login" className="btn-ghost">Log in</Link><Link to="/signup" className="btn-primary">Sign up</Link></>}
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <span className="chip bg-brand-50 text-brand-700"><HeartPulse className="size-3.5" />Privacy-focused emergency blood donation</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Every drop<br /><span className="text-brand-600">connects.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-gray-600">Blood Bridge connects patients with nearby, compatible and verified donors through real-time SOS requests, map search, secure chat and BloodBot, an assistant that understands English and Roman Urdu.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={appLink} className="btn-primary px-6 py-3 text-base">{me ? "Open the app" : "Become a donor"}<ArrowRight className="size-4" /></Link>
              <Link to={me ? "/app" : "/login"} className="btn-ghost px-6 py-3 text-base"><Siren className="size-4" />I need blood</Link>
            </div>
            <div className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {[["Verified donors", stats.donors], ["Open requests", stats.open], ["Donations logged", stats.donations]].map(([k, v]) => (
                <div key={k}><div className="text-3xl font-extrabold">{v}</div><div className="text-xs text-gray-500">{k}</div></div>
              ))}
            </div>
          </div>
          <div className="card relative p-5 shadow-lift">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4"><span className="grid size-10 place-items-center rounded-full bg-brand-50 text-brand-600"><Bot className="size-5" /></span><div><div className="font-semibold">BloodBot</div><div className="text-xs text-gray-500">Natural-language assistant</div></div></div>
            <div className="space-y-3 py-4 text-sm">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-white">Mujhe 2 bottle O- chahiye Jinnah Hospital mein, urgent</div>
              <div className="w-fit max-w-[90%] rounded-2xl rounded-tl-md bg-gray-100 px-3.5 py-2.5">Please confirm the SOS:<br />• Blood type: <b>O-</b><br />• Place: <b>Jinnah Postgraduate Medical Centre</b><br />• Units: <b>2</b> · Urgency: <b>urgent</b></div>
              <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-white">Haan bhej do</div>
              <div className="w-fit max-w-[90%] rounded-2xl rounded-tl-md bg-gray-100 px-3.5 py-2.5">🚨 <b>SOS posted.</b> I alerted compatible donors nearby.</div>
            </div>
            <p className="text-xs text-gray-400">Try it with the red button in the corner. No sign-in needed for questions.</p>
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 bg-gray-50 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-extrabold tracking-tight">Built for emergencies, designed for trust</h2>
          <p className="mt-2 max-w-2xl text-gray-600">The same features as the Blood Bridge mobile app, in your browser.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-5"><span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-5" /></span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-1.5 text-sm text-gray-600">{body}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-3">
          {[["1", "Sign up and verify", "Create an account, add your blood type and CNIC. An admin verifies you."], ["2", "Request or offer", "Post an SOS when you need blood, or a donation offer when you can give."], ["3", "Connect privately", "Chat in the app, meet at the hospital, then log the donation to earn points."]].map(([n, t, b]) => (
            <div key={n}><div className="grid size-10 place-items-center rounded-full bg-gray-900 font-bold text-white">{n}</div><h3 className="mt-4 text-lg font-semibold">{t}</h3><p className="mt-1 text-gray-600">{b}</p></div>
          ))}
        </div>
        <div className="mx-auto mt-12 max-w-6xl px-5">
          <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-gradient-to-r from-brand-600 to-brand-700 p-8 text-white sm:flex-row sm:items-center">
            <div><h3 className="text-2xl font-extrabold">Ready to save a life?</h3><p className="mt-1 text-white/85">Demo donor: ahmed@bloodbridge.demo · Demo#1234 (admin: admin@bloodbridge.demo · Admin#1234)</p></div>
            <Link to={me ? appLink : "/login?demo=1"} className="btn bg-white px-6 py-3 text-brand-700 hover:bg-brand-50">{me ? "Open app" : "Try the demo"}<ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-sm text-gray-500">
          <Logo /><span className="flex items-center gap-1.5"><MessageCircle className="size-4" />Final Year Project · Designed and developed by Hafsah Zulfiqar</span>
        </div>
      </footer>
      <BotLauncher />
    </div>
  );
}
