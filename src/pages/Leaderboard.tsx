import { useMemo, useState } from "react";
import { Trophy, Info } from "lucide-react";
import { AWARDS, leaderboard, useCurrentUser, useDB } from "../lib/store";
import { Avatar, PageHead } from "../components/ui";

export default function Leaderboard() {
  const me = useCurrentUser()!;
  const db = useDB((d) => d);
  const [tab, setTab] = useState<"leaderboard" | "awards">("leaderboard");
  const rows = useMemo(() => leaderboard(db), [db]);
  const myIdx = rows.findIndex((r) => r.user.uid === me.uid);
  const mine = rows[myIdx];
  const confirmed = mine?.records ?? 0;
  const next = AWARDS.find((a) => confirmed < a.minRecords);
  const top = rows.slice(0, 3);
  const podium = [top[1], top[0], top[2]];

  return (
    <div>
      <PageHead title="Leaderboard" subtitle="Recognising the people who keep Karachi's blood supply going." />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-gray-500">Your rank</div><div className="text-2xl font-extrabold">#{myIdx + 1}<span className="text-sm font-medium text-gray-400"> of {rows.length}</span></div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Your points</div><div className="text-2xl font-extrabold">{mine?.points ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Next badge</div><div className="text-lg font-bold">{next ? `${next.icon} ${next.title}` : "All earned 👑"}</div>{next ? <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(confirmed / next.minRecords) * 100}%` }} /></div> : null}</div>
      </div>
      <div role="tablist" className="mb-5 inline-flex rounded-2xl bg-white p-1 shadow-card">
        {(["leaderboard", "awards"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-gray-900 text-white" : "text-gray-600"}`}>{t}</button>)}
      </div>
      {tab === "leaderboard" ? (
        <>
          <div className="mb-6 grid grid-cols-3 items-end gap-3">
            {podium.map((r, i) => r ? (
              <div key={r.user.uid} className="flex flex-col items-center text-center">
                <Avatar name={r.user.fullName} size={i === 1 ? 64 : 52} />
                <div className="mt-2 truncate text-sm font-semibold">{r.user.fullName.split(" ")[0]}</div>
                <div className="text-xs text-gray-500">{r.points} pts</div>
                <div className={`mt-2 grid w-full place-items-center rounded-t-2xl font-extrabold text-white ${i === 1 ? "h-28 bg-amber-400" : i === 0 ? "h-20 bg-gray-400" : "h-14 bg-orange-400"}`}>{i === 1 ? 1 : i === 0 ? 2 : 3}</div>
              </div>
            ) : <div key={i} />)}
          </div>
          <div className="card divide-y divide-gray-100">
            {rows.map((r, i) => (
              <div key={r.user.uid} className={`flex items-center gap-3 p-3.5 ${r.user.uid === me.uid ? "bg-brand-50" : ""}`}>
                <span className="w-7 text-center text-sm font-bold text-gray-400">{i + 1}</span>
                <Avatar name={r.user.fullName} size={38} />
                <div className="min-w-0 flex-1"><div className="font-semibold">{r.user.fullName}{r.user.uid === me.uid ? " (you)" : ""}</div><div className="text-xs text-gray-500">{r.user.bloodType} · {r.records} donations · {r.posts} offers</div></div>
                <div className="text-right"><div className="font-extrabold">{r.points}</div><div className="text-[11px] text-gray-400">points</div></div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800"><Info className="mt-0.5 size-4 shrink-0" />Points: <b>100</b> per donation offer and <b>150</b> per confirmed donation.</div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AWARDS.map((a) => {
            const earned = confirmed >= a.minRecords;
            return (
              <div key={a.id} className={`card p-5 ${earned ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between"><span className="text-4xl">{a.icon}</span>{earned ? <span className="chip bg-green-50 text-green-700">Earned ✓</span> : <span className="chip bg-gray-100 text-gray-500">{confirmed}/{a.minRecords}</span>}</div>
                <div className="mt-3 font-bold">{a.title}</div><div className="text-sm text-gray-500">{a.desc}</div>
              </div>
            );
          })}
          <div className="card flex items-center gap-3 p-5 sm:col-span-2 lg:col-span-3"><Trophy className="size-6 text-amber-500" /><p className="text-sm text-gray-600">Badges are based on confirmed donations you log after giving blood.</p></div>
        </div>
      )}
    </div>
  );
}
