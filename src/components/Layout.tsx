import { useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Home, Search, MessageCircle, HeartHandshake, Trophy, User, Bell, Bot, X, LogOut, Siren, ShieldCheck } from "lucide-react";
import { logOut, useCurrentUser, useDB, useReady } from "../lib/store";
import BotChat from "./BotChat";
import { Avatar } from "./ui";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Blood Bridge home">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-600 shadow-lift">
        <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 0c4 5.5 7 9.5 7 13.2A7 7 0 0 1 1 13.2C1 9.5 4 5.5 8 0z" fill="#fff" /></svg>
      </span>
      <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-gray-900"}`}>Blood Bridge</span>
    </Link>
  );
}

const tabs = [
  { to: "/app", label: "Home", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/donate", label: "Donate", icon: HeartHandshake },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/profile", label: "Profile", icon: User },
];

export function BotLauncher() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  if (pathname === "/bot") return null;
  return (
    <>
      {open ? (
        <div className="fixed inset-x-2 bottom-20 z-[1200] flex h-[70vh] max-h-[620px] flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lift sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[400px] lg:bottom-6 lg:right-24">
          <div className="flex items-center justify-between bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-full bg-white/15"><Bot className="size-5" /></span><div><div className="font-semibold leading-tight">BloodBot</div><div className="text-xs text-white/80">NLP assistant · English & Roman Urdu</div></div></div>
            <div className="flex items-center gap-1"><Link to="/bot" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-white/15">Full screen</Link><button onClick={() => setOpen(false)} aria-label="Close BloodBot" className="grid size-8 place-items-center rounded-full hover:bg-white/15"><X className="size-5" /></button></div>
          </div>
          <BotChat compact />
        </div>
      ) : null}
      <button onClick={() => setOpen(!open)} aria-label={open ? "Close BloodBot" : "Open BloodBot"} className="fixed bottom-20 right-4 z-[1200] grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-lift transition hover:scale-105 hover:bg-brand-700 lg:bottom-6 lg:right-6">
        {open ? <X className="size-6" /> : <Bot className="size-6" />}
      </button>
    </>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const unread = useDB((d) => d.notifications.filter((n) => n.uid === d.session && !n.isRead).length);
  const unreadChats = useDB((d) => d.chats.reduce((s, c) => s + (c.unread[d.session ?? ""] ?? 0), 0));
  if (!me) return <Navigate to="/login" replace />;
  const out = () => { logOut(); navigate("/"); };
  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-100 bg-white px-4 py-5 lg:flex">
        <Logo />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/app"} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"}`}>
              <Icon className="size-5" />{label}
              {to === "/chat" && unreadChats ? <span className="ml-auto rounded-full bg-brand-600 px-2 text-xs font-bold text-white">{unreadChats}</span> : null}
            </NavLink>
          ))}
          <NavLink to="/requests" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"}`}><Siren className="size-5" />Urgent requests</NavLink>
          <NavLink to="/eligibility" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"}`}><ShieldCheck className="size-5" />Eligibility check</NavLink>
          <NavLink to="/bot" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"}`}><Bot className="size-5" />BloodBot</NavLink>
        </nav>
        <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
          <Avatar name={me.fullName} size={38} />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{me.fullName}</div><div className="text-xs text-gray-500">{me.bloodType ?? "—"} · {me.isAvailable ? "Available" : "Unavailable"}</div></div>
          <button onClick={out} aria-label="Log out" className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-white"><LogOut className="size-4" /></button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 backdrop-blur lg:pl-64">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <div className="lg:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/requests" className="btn-soft hidden px-3 py-2 text-xs sm:inline-flex"><Siren className="size-4" />Requests</Link>
            <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative grid size-10 place-items-center rounded-full hover:bg-gray-100">
              <Bell className="size-5" />
              {unread ? <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{unread}</span> : null}
            </Link>
            <Link to="/profile" aria-label="Profile" className="lg:hidden"><Avatar name={me.fullName} size={34} /></Link>
          </div>
        </div>
      </header>

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pl-[calc(16rem+1.5rem)]">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/app"} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${isActive ? "text-brand-600" : "text-gray-500"}`}>
            <Icon className="size-5" />{label === "Leaderboard" ? "Ranks" : label}
            {to === "/chat" && unreadChats ? <span className="absolute right-[22%] top-1.5 size-2 rounded-full bg-brand-600" /> : null}
          </NavLink>
        ))}
      </nav>
      <BotLauncher />
    </div>
  );
}

/** Same gate as the mobile app: logged in → profile complete → verified, admins go to their dashboard. */
export function Loading() {
  return <div className="grid min-h-screen place-items-center bg-gray-50"><div className="flex items-center gap-3 text-sm text-gray-500"><span className="size-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />Loading your Blood Bridge…</div></div>;
}

export function Gate({ children, need = "approved" }: { children: ReactNode; need?: "auth" | "approved" | "admin" }) {
  const me = useCurrentUser();
  const ready = useReady();
  if (!ready) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  if (need === "admin") return me.role === "admin" ? <>{children}</> : <Navigate to="/app" replace />;
  if (me.role === "admin") return <Navigate to="/admin" replace />;
  if (need === "approved") {
    if (me.status === "incomplete" || me.status === "rejected") return <Navigate to="/profile/setup" replace />;
    if (me.status === "pending") return <Navigate to="/status" replace />;
  }
  return <>{children}</>;
}
