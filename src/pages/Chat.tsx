import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock, MessageCircle, Send } from "lucide-react";
import { markChatRead, sendMessage, useCurrentUser, useDB } from "../lib/store";
import { Avatar, BloodBadge, Empty, PageHead, timeAgo } from "../components/ui";

export function ChatList() {
  const me = useCurrentUser()!;
  const { chats, users } = useDB((d) => ({ chats: d.chats.filter((c) => c.participants.includes(me.uid)), users: d.users }));
  return (
    <div>
      <PageHead title="Messages" subtitle="Private conversations. Phone numbers are never shared." />
      <div className="card divide-y divide-gray-100">
        {chats.length ? chats.map((c) => {
          const other = users.find((u) => u.uid === c.participants.find((p) => p !== me.uid));
          if (!other) return null;
          const unread = c.unread[me.uid] ?? 0;
          return (
            <Link key={c.id} to={`/chat/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-gray-50">
              <Avatar name={other.fullName} size={46} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{other.fullName}</span><span className="text-xs text-gray-400">{c.lastMessage ? timeAgo(c.lastMessageAt) : ""}</span></div>
                <div className="flex items-center justify-between gap-2"><span className={`truncate text-sm ${unread ? "font-semibold text-gray-900" : "text-gray-500"}`}>{c.lastSenderId === me.uid ? "You: " : ""}{c.lastMessage || "Say hello 👋"}</span>{unread ? <span className="grid min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{unread}</span> : null}</div>
              </div>
            </Link>
          );
        }) : <Empty icon={<MessageCircle className="size-6" />} title="No conversations yet" body="Start a chat from Search, or respond to an urgent request." action={<Link to="/search" className="btn-primary">Find donors</Link>} />}
      </div>
    </div>
  );
}

const QUICK = ["I can donate today.", "Which hospital and ward?", "Please share the patient's name for the blood bank counter.", "I'm on my way."];

export function Conversation() {
  const { id = "" } = useParams();
  const me = useCurrentUser()!;
  const { chat, messages, users } = useDB((d) => ({ chat: d.chats.find((c) => c.id === id), messages: d.messages.filter((m) => m.chatId === id), users: d.users }));
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chat && (chat.unread[me.uid] ?? 0) > 0) markChatRead(id); end.current?.scrollIntoView({ block: "end" }); }, [messages.length, id, chat, me.uid]);
  if (!chat || !chat.participants.includes(me.uid)) return <Navigate to="/chat" replace />;
  const other = users.find((u) => u.uid === chat.participants.find((p) => p !== me.uid))!;
  const send = (t: string) => { sendMessage(id, t); setText(""); };

  return (
    <div className="card flex h-[calc(100vh-11rem)] min-h-[480px] flex-col overflow-hidden lg:h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 border-b border-gray-100 p-3">
        <Link to="/chat" aria-label="Back to messages" className="grid size-9 place-items-center rounded-full hover:bg-gray-100"><ArrowLeft className="size-5" /></Link>
        <Avatar name={other.fullName} size={40} />
        <div className="min-w-0 flex-1"><div className="font-semibold">{other.fullName}</div><div className="text-xs text-gray-500">{other.location} · {other.isAvailable ? "available" : "unavailable"}</div></div>
        <BloodBadge type={other.bloodType} size="sm" />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50/60 p-4">
        <div className="mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs text-green-700"><Lock className="size-3" />Private chat · numbers stay hidden</div>
        {messages.map((m) => {
          const mine = m.senderId === me.uid;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white shadow-card"}`}>{m.text}<div className={`mt-0.5 text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div>
            </div>
          );
        })}
        {!messages.length ? <p className="pt-10 text-center text-sm text-gray-500">Start the conversation with {other.fullName.split(" ")[0]}.</p> : null}
        <div ref={end} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-t border-gray-100 px-3 pt-2">{QUICK.map((q) => <button key={q} onClick={() => send(q)} className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs hover:bg-gray-50">{q}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2 p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" aria-label="Message" className="input flex-1" />
        <button type="submit" disabled={!text.trim()} aria-label="Send message" className="btn-primary w-11 p-0"><Send className="size-4" /></button>
      </form>
    </div>
  );
}
