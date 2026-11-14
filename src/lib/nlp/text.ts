/** Text normalisation for BloodBot: lower-casing, Roman Urdu → English mapping, stop-words and stemming. */

/** Common Roman Urdu words people type in Pakistan, mapped to English so one model handles both. */
export const ROMAN_URDU: Record<string, string> = {
  khoon: "blood", khon: "blood", khoonn: "blood", chahiye: "need", chahye: "need", chaiye: "need", chahiay: "need", zaroorat: "need", zarurat: "need",
  kahan: "where", kaha: "where", kidhar: "where", kab: "when", kitna: "how many", kitne: "how many", kitni: "how many", kaise: "how", kese: "how", kaisay: "how",
  kya: "what", kia: "what", mein: "in", main: "i", mai: "i", mujhe: "me", mujhy: "me", mera: "my", meri: "my", mere: "my", hum: "we", aap: "you", ap: "you",
  karna: "do", karni: "do", karo: "do", kar: "do", sakta: "can", sakti: "can", sakte: "can", skta: "can", skti: "can", nahi: "not", nahin: "not", ni: "not",
  haan: "yes", han: "yes", ji: "yes", jaldi: "urgent", abhi: "now", foran: "urgent", fori: "urgent", emergency: "emergency", madad: "help", madat: "help",
  dena: "donate", deni: "donate", dun: "donate", doon: "donate", daan: "donate", atiya: "donate", qareeb: "near", nazdeek: "near", paas: "near", pass: "near",
  aspatal: "hospital", hospatal: "hospital", hasptal: "hospital", bottle: "units", botal: "units", bag: "units", bags: "units", pint: "units",
  umar: "age", umr: "age", wazan: "weight", wazn: "weight", bukhar: "fever", bimar: "ill", bemar: "ill", dawai: "medication", dawa: "medication",
  shukriya: "thanks", shukria: "thanks", salam: "hello", assalam: "hello", aoa: "hello", walaikum: "hello", tattoo: "tattoo", operation: "surgery",
  pregnant: "pregnant", hamla: "pregnant", donor: "donor", donors: "donors", wala: "", wali: "", hai: "", hain: "", ho: "", ka: "", ki: "", ke: "", ko: "", se: "", ne: "", bhi: "", to: "",
  ek: "1", aik: "1", teen: "3", char: "4", chaar: "4", panch: "5", paanch: "5",
};

const STOP = new Set("a an the is are am be been being to of for on at by with and or i me my we our you your it its this that these those please pls plz can could would should do does did will shall may might there here what which who whom whose how when where why tell know about any some just really very also have has had get got want".split(" "));
/** Words that carry meaning for intent detection even though they look like stop-words. */
const KEEP = new Set(["can", "how", "when", "where", "who", "what", "not", "my", "me", "do", "i", "you", "is"]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/(\b(?:a|b|ab|o))\s*(\+|positive|pos|\+ve|-|negative|neg|-ve)/g, " $1$2 ") // keep blood types together
    .replace(/[^a-z0-9+\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light suffix stripper (Porter-style subset) so "donating", "donated", "donation" share a stem. */
export function stem(w: string): string {
  if (w.length <= 3 || /[+\-]/.test(w) || /^\d/.test(w)) return w;
  const rules: [RegExp, string][] = [
    [/ations?$/, "ate"], [/ies$/, "y"], [/ing$/, ""], [/edly$/, ""], [/ed$/, ""], [/ers?$/, ""], [/ly$/, ""], [/ment$/, ""], [/ness$/, ""], [/ible$/, ""], [/able$/, ""], [/s$/, ""],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w)) { const out = w.replace(re, rep); if (out.length >= 3) return out.replace(/(.)\1$/, "$1"); }
  }
  return w;
}

export function tokens(text: string, { keepStop = false } = {}): string[] {
  return normalize(text)
    .split(" ")
    .flatMap((t) => (t in ROMAN_URDU ? (ROMAN_URDU[t] ?? "").split(" ") : [t]))
    .filter((t) => t && (keepStop || KEEP.has(t) || !STOP.has(t)))
    .map(stem);
}

/** Unigrams + bigrams, used as features by the intent classifier. */
export function features(text: string): string[] {
  const t = tokens(text);
  const bi = t.slice(1).map((w, i) => `${t[i]}_${w}`);
  return [...t, ...bi];
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)] as number[]);
  for (let j = 1; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m]![n]!;
}
