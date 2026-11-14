import { useState } from "react";
import { Bot, Brain, Tags, Workflow, Languages } from "lucide-react";
import BotChat from "../components/BotChat";
import { PageHead } from "../components/ui";

export default function BotPage() {
  const [debug, setDebug] = useState(false);
  return (
    <div>
      <PageHead title="BloodBot" subtitle="Ask in English or Roman Urdu: find donors, post an SOS, check eligibility, learn about donation." right={<label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} className="size-4 accent-brand-600" />Show NLP details</label>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="card flex h-[calc(100vh-13rem)] min-h-[520px] flex-col overflow-hidden"><BotChat showDebug={debug} /></div>
        <aside className="space-y-3">
          <div className="card p-5">
            <div className="flex items-center gap-2 font-bold"><Bot className="size-5 text-brand-600" />How BloodBot works</div>
            <p className="mt-2 text-sm text-gray-600">A natural-language pipeline that runs entirely in your browser: no data leaves your device.</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex gap-2.5"><Languages className="mt-0.5 size-4 shrink-0 text-brand-600" /><span><b>Normalisation:</b> Roman Urdu words (khoon, chahiye, kahan) mapped to English, stop-words removed, words stemmed.</span></li>
              <li className="flex gap-2.5"><Brain className="mt-0.5 size-4 shrink-0 text-brand-600" /><span><b>Intent classifier:</b> TF-IDF over words and word pairs, cosine similarity to 250+ example phrases, confidence threshold for unknowns.</span></li>
              <li className="flex gap-2.5"><Tags className="mt-0.5 size-4 shrink-0 text-brand-600" /><span><b>Entity recognition:</b> blood types in any spelling, Karachi areas and hospitals (typo-tolerant), units, age, weight, dates and urgency.</span></li>
              <li className="flex gap-2.5"><Workflow className="mt-0.5 size-4 shrink-0 text-brand-600" /><span><b>Dialogue manager:</b> remembers what's missing in multi-step tasks (like an SOS) and acts on real app data.</span></li>
            </ul>
          </div>
          <div className="card p-5 text-sm">
            <div className="font-bold">Try asking</div>
            <ul className="mt-2 space-y-1.5 text-gray-600">
              <li>"koi O+ donor hai North Nazimabad mein?"</li>
              <li>"my mother needs 2 units AB- at Indus, critical"</li>
              <li>"I got a tattoo 4 months ago"</li>
              <li>"who can donate to B-?"</li>
              <li>"nearest blood bank to Gulshan"</li>
              <li>"mark me unavailable"</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
