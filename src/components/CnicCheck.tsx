import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ScanText, TriangleAlert, XCircle } from "lucide-react";
import { readCnic, type CnicReading } from "../lib/ai/cnicVision";

export type CnicCheckResult = { cnic: string | null; matchesTyped: boolean | null; confidence: number; qualityOk: boolean; issues: string[]; dateOfBirth: string | null; checkedAt: string };

/** Reads the uploaded CNIC photo with in-browser OCR and compares it with the typed number. */
export function CnicCheck({ image, typed, onResult, onUseNumber, onUseDob }: {
  image: string; typed: string; onResult: (r: CnicCheckResult) => void; onUseNumber: (cnic: string) => void; onUseDob: (iso: string) => void;
}) {
  const [state, setState] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [r, setR] = useState<CnicReading | null>(null);
  useEffect(() => {
    if (!image) return;
    let live = true;
    setState("reading");
    readCnic(image, typed).then((res) => {
      if (!live) return;
      setR(res); setState("done");
      onResult({ cnic: res.cnic, matchesTyped: res.matchesTyped, confidence: res.confidence, qualityOk: res.quality.ok, issues: res.quality.issues, dateOfBirth: res.dateOfBirth, checkedAt: new Date().toISOString() });
    }).catch(() => live && setState("error"));
    return () => { live = false; };
    // re-read only when the photo changes; the typed number is compared below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  if (!image) return null;
  const match = r?.cnic && /^\d{5}-\d{7}-\d$/.test(typed) ? r.cnic === typed : null;
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm" aria-live="polite">
      <div className="flex items-center gap-2 font-semibold"><ScanText className="size-4 text-brand-600" />AI CNIC reader <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">computer vision</span></div>
      {state === "reading" && <p className="mt-2 flex items-center gap-2 text-gray-500"><Loader2 className="size-4 animate-spin" />Checking photo quality and reading the card… (first run loads the OCR model, ~3 MB)</p>}
      {state === "error" && <p className="mt-2 text-gray-500">Couldn't read the photo here. An administrator will check it manually.</p>}
      {state === "done" && r && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${r.quality.ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>{r.quality.ok ? "Photo quality good" : r.quality.issues.join(" · ")}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-gray-600 ring-1 ring-gray-200">sharpness {r.quality.sharpness} · brightness {r.quality.brightness} · contrast {r.quality.contrast}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-gray-600 ring-1 ring-gray-200">OCR confidence {r.confidence}% · {(r.ms / 1000).toFixed(1)} s</span>
          </div>
          {r.cnic ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Number on the card: <b className="font-mono">{r.cnic}</b></span>
              {match === true && <span className="flex items-center gap-1 font-semibold text-green-700"><CheckCircle2 className="size-4" />matches what you typed</span>}
              {match === false && <><span className="flex items-center gap-1 font-semibold text-red-600"><XCircle className="size-4" />doesn't match what you typed</span><button type="button" className="text-brand-700 underline" onClick={() => onUseNumber(r.cnic!)}>Use number from card</button></>}
              {match === null && <button type="button" className="text-brand-700 underline" onClick={() => onUseNumber(r.cnic!)}>Fill in this number</button>}
            </div>
          ) : <p className="flex items-center gap-1 text-amber-800"><TriangleAlert className="size-4" />Couldn't find a 13-digit CNIC number. Try a sharper, well-lit photo of the front side.</p>}
          {r.dateOfBirth && <div>Date of birth on the card: <b>{r.dateOfBirth}</b> <button type="button" className="ml-1 text-brand-700 underline" onClick={() => onUseDob(r.dateOfBirth!)}>Use it</button></div>}
          {r.name && <div className="text-gray-500">Name on the card: {r.name}</div>}
        </div>
      )}
    </div>
  );
}
