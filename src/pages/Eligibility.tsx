import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, Stethoscope, XCircle, RotateCcw } from "lucide-react";
import { checkEligibility, type EligibilityResult } from "../lib/eligibility";
import { updateProfile, useCurrentUser } from "../lib/store";
import { PageHead } from "../components/ui";

const QUESTIONS = [
  ["hasFever", "Do you have a fever today?"],
  ["hasIllness", "Are you currently ill (cold, flu, infection)?"],
  ["isOnMedication", "Are you taking any medication?"],
  ["hadSurgeryRecently", "Have you had surgery in the last 6 months?"],
  ["hadTattooOrPiercing", "Have you had a tattoo or piercing in the last 6 months?"],
  ["isPregnantOrBreastfeeding", "Are you pregnant or breastfeeding?"],
  ["hadBloodTransfusion", "Have you received a blood transfusion in the last 12 months?"],
] as const;
type Key = (typeof QUESTIONS)[number][0];

const LOOK: Record<EligibilityResult["outcome"], { icon: typeof CheckCircle2; cls: string }> = {
  eligible: { icon: CheckCircle2, cls: "bg-green-50 text-green-800 border-green-200" },
  wait: { icon: Clock3, cls: "bg-amber-50 text-amber-800 border-amber-200" },
  medical_review: { icon: Stethoscope, cls: "bg-blue-50 text-blue-800 border-blue-200" },
  not_eligible: { icon: XCircle, cls: "bg-brand-50 text-brand-800 border-brand-200" },
};

export default function Eligibility() {
  const me = useCurrentUser()!;
  const [base, setBase] = useState({ dateOfBirth: me.dateOfBirth ?? "", weight: me.weight ? String(me.weight) : "", lastDonationDate: me.lastDonationDate ?? "" });
  const [answers, setAnswers] = useState<Record<Key, boolean | null>>(Object.fromEntries(QUESTIONS.map(([k]) => [k, null])) as Record<Key, boolean | null>);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const done = Object.values(answers).every((v) => v !== null) && base.dateOfBirth && base.weight;

  const run = () => {
    const r = checkEligibility({ dateOfBirth: base.dateOfBirth, weight: Number(base.weight), ...(base.lastDonationDate ? { lastDonationDate: base.lastDonationDate } : {}), ...(Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, !!v])) as Record<Key, boolean>) });
    setResult(r);
    updateProfile({ eligibilityOutcome: r.outcome, dateOfBirth: base.dateOfBirth, weight: Number(base.weight), ...(base.lastDonationDate ? { lastDonationDate: base.lastDonationDate } : {}) });
  };
  const L = result ? LOOK[result.outcome] : null;

  return (
    <div className="max-w-3xl">
      <PageHead title="Eligibility checker" subtitle="Based on WHO and Pakistan blood donation guidelines: the same rules as the Blood Bridge mobile app." />
      {result && L ? (
        <div className={`mb-5 rounded-3xl border p-6 ${L.cls}`} role="status">
          <div className="flex items-start gap-3"><L.icon className="mt-0.5 size-7 shrink-0" /><div><h2 className="text-xl font-extrabold">{result.title}</h2><p className="mt-1">{result.message}</p>{result.nextEligibleDate ? <p className="mt-2 font-semibold">Next eligible date: {result.nextEligibleDate}</p> : null}{result.reasons.length ? <ul className="mt-2 list-disc pl-5 text-sm">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}</div></div>
          <div className="mt-4 flex flex-wrap gap-2">{result.outcome === "eligible" ? <Link to="/requests" className="btn-primary">See who needs blood</Link> : null}<button onClick={() => { setResult(null); setAnswers(Object.fromEntries(QUESTIONS.map(([k]) => [k, null])) as Record<Key, boolean | null>); }} className="btn-ghost"><RotateCcw className="size-4" />Check again</button></div>
        </div>
      ) : null}
      <div className="card space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="label">Date of birth</span><input type="date" className="input" value={base.dateOfBirth} onChange={(e) => setBase({ ...base, dateOfBirth: e.target.value })} /></label>
          <label><span className="label">Weight (kg)</span><input type="number" className="input" value={base.weight} onChange={(e) => setBase({ ...base, weight: e.target.value })} /></label>
          <label><span className="label">Last donation</span><input type="date" className="input" value={base.lastDonationDate} onChange={(e) => setBase({ ...base, lastDonationDate: e.target.value })} max={new Date().toISOString().slice(0, 10)} /></label>
        </div>
        <div className="divide-y divide-gray-100">
          {QUESTIONS.map(([k, q]) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm font-medium">{q}</span>
              <div className="flex gap-1.5" role="radiogroup" aria-label={q}>{([true, false] as const).map((v) => <button key={String(v)} role="radio" aria-checked={answers[k] === v} onClick={() => setAnswers({ ...answers, [k]: v })} className={`w-16 rounded-xl border py-2 text-sm font-semibold ${answers[k] === v ? (v ? "border-brand-600 bg-brand-600 text-white" : "border-gray-900 bg-gray-900 text-white") : "border-gray-200"}`}>{v ? "Yes" : "No"}</button>)}</div>
            </div>
          ))}
        </div>
        <button onClick={run} disabled={!done} className="btn-primary w-full py-3">{done ? "Check my eligibility" : "Answer all questions to continue"}</button>
      </div>
    </div>
  );
}
