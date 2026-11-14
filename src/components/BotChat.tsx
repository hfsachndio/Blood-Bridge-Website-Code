import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Send, MessageCircle, Sparkles } from "lucide-react";
import { BloodBot, type BotReply } from "../lib/nlp/bot";
import { currentUser, openChat, respondToRequest } from "../lib/store";
import { BloodBadge, Priority, RichText, toast } from "./ui";

type Turn = { from: "user" | "bot"; reply?: BotReply; text?: string };
const bot = new BloodBot();
let history: Turn[] = [];

/** BloodBot conversation UI, shared by the floating widget and the full /bot page. */
export default function BotChat({ compact = false, showDebug = false }: { compact?: boolean; showDebug?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>(() => (history.length ? history : [{ from: "bot", reply: bot.greeting() }]));
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => { history = turns; end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, typing]);

  const send = (text: string) => {
    const t = text.trim(); if (!t) return;
    setTurns((x) => [...x, { from: "user", text: t }]);
    setInput(""); setTyping(true);
    setTimeout(() => { setTurns((x) => [...x, { from: "bot", reply: bot.reply(t) }]); setTyping(false); }, 350 + Math.min(700, t.length * 12));
  };
  const chatWith = (uid: string) => {
    const me = currentUser(); if (!me) { navigate("/login"); return; }
    navigate(`/chat/${openChat(me.uid, uid)}`);
  };
  const respond = (id: string) => {
    if (!currentUser()) { navigate("/login"); return; }
    const chat = respondToRequest(id); toast("Response sent", "The requester has been notified and a chat has started.");
    if (chat) navigate(`/chat/${chat}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex-1 space-y-3 overflow-y-auto ${compact ? "p-3" : "p-4 sm:p-6"}`} aria-live="polite">
        {turns.map((t, i) => t.from === "user" ? (
          <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-sm text-white">{t.text}</div></div>
        ) : (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><Bot className="size-4" /></span>
            <div className="min-w-0 max-w-[88%] space-y-2">
              <div className="rounded-2xl rounded-tl-md bg-gray-100 px-3.5 py-2.5 text-sm leading-relaxed text-gray-800"><RichText text={t.reply!.text} /></div>
              {t.reply!.donors?.map((d) => (
                <div key={d.uid} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-2.5 shadow-card">
                  <BloodBadge type={d.bloodType} size="sm" />
                  <div className="min-w-0 flex-1 text-sm"><div className="font-semibold">{d.name}</div><div className="text-xs text-gray-500">{d.area} · {d.km} · {d.available ? (d.readyNow ? "available now" : "available, waiting period") : "not available"}</div></div>
                  <button onClick={() => chatWith(d.uid)} className="btn-soft px-3 py-1.5 text-xs"><MessageCircle className="size-3.5" />Chat</button>
                </div>
              ))}
              {t.reply!.requests?.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-2.5 shadow-card">
                  <BloodBadge type={r.bloodType} size="sm" />
                  <div className="min-w-0 flex-1 text-sm"><div className="font-semibold">{r.hospital}</div><div className="flex items-center gap-1.5 text-xs text-gray-500">{r.units} unit(s) · {r.km} <Priority p={r.priority} /></div></div>
                  <button onClick={() => respond(r.id)} className="btn-primary px-3 py-1.5 text-xs">I can donate</button>
                </div>
              ))}
              {t.reply!.links?.length ? <div className="flex flex-wrap gap-2">{t.reply!.links.map((l) => <Link key={l.to + l.label} to={l.to} className="btn-ghost px-3 py-1.5 text-xs">{l.label}</Link>)}</div> : null}
              {i === turns.length - 1 && t.reply!.chips?.length ? <div className="flex flex-wrap gap-1.5">{t.reply!.chips.map((c) => <button key={c} onClick={() => send(c)} className="rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">{c}</button>)}</div> : null}
              {showDebug && t.reply!.debug ? <div className="font-mono text-[10px] text-gray-400">intent: {t.reply!.debug.intent} · confidence {t.reply!.debug.confidence} · entities {JSON.stringify(Object.fromEntries(Object.entries(t.reply!.debug.entities).map(([k, v]) => [k, typeof v === "object" ? (v as { name: string }).name : v])))}</div> : null}
            </div>
          </div>
        ))}
        {typing ? <div className="flex items-center gap-2 text-xs text-gray-400"><Sparkles className="size-3.5 animate-pulse" />BloodBot is typing…</div> : null}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-gray-100 bg-white p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask in English or Roman Urdu…" aria-label="Message BloodBot" className="input h-11 flex-1" />
        <button type="submit" disabled={!input.trim()} aria-label="Send" className="btn-primary h-11 w-11 p-0"><Send className="size-4" /></button>
      </form>
    </div>
  );
}
