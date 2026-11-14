/** Named-entity extraction for BloodBot: blood types, places, units, age, weight, time since donation, urgency. */
import { ALL_PLACES, BLOOD_TYPES, type BloodType, type Place } from "../blood";
import { levenshtein, normalize } from "./text";

export interface Entities {
  bloodType?: BloodType;
  place?: Place;
  units?: number;
  age?: number;
  weightKg?: number;
  daysSinceDonation?: number;
  urgency?: "critical" | "urgent" | "normal";
  yes?: boolean;
  no?: boolean;
}

const SIGN: Record<string, "+" | "-"> = { "+": "+", positive: "+", pos: "+", "+ve": "+", ve: "+", "-": "-", negative: "-", neg: "-", "-ve": "-" };

export function extractBloodType(text: string): BloodType | undefined {
  const t = " " + text.toLowerCase().replace(/[()]/g, " ") + " ";
  const m = t.match(/(?:^|[^a-z])(ab|a|b|o|0)\s*(\+ve|-ve|\+|-|positive|negative|pos|neg)(?=[^a-z]|$)/);
  if (!m) return undefined;
  const group = (m[1] === "0" ? "O" : m[1]!.toUpperCase()) as "A" | "B" | "AB" | "O";
  const sign = SIGN[m[2]!];
  const bt = `${group}${sign}` as BloodType;
  return BLOOD_TYPES.includes(bt) ? bt : undefined;
}

/** Finds a Karachi area, hospital or blood bank, tolerating small typos ("gulshen", "jinah hospital"). */
export function extractPlace(text: string): Place | undefined {
  const t = normalize(text);
  let best: { p: Place; score: number } | undefined;
  for (const p of ALL_PLACES) {
    const names = [p.name, ...(p.aliases ?? [])].map((n) => normalize(n));
    for (const n of names) {
      if (n.length < 3) continue;
      if (t.includes(n)) { const score = n.length * 2; if (!best || score > best.score) best = { p, score }; continue; }
      // fuzzy: compare each n-word window of the message with the name
      const words = t.split(" "), size = n.split(" ").length;
      for (let i = 0; i + size <= words.length; i++) {
        const win = words.slice(i, i + size).join(" ");
        if (win.length < 4) continue;
        const dist = levenshtein(win, n);
        if (dist <= Math.max(1, Math.floor(n.length / 6))) { const score = n.length * 2 - dist * 3; if (!best || score > best.score) best = { p, score }; }
      }
    }
  }
  return best?.p;
}

const NUMWORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ek: 1, aik: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5 };

export function extractUnits(text: string): number | undefined {
  const t = normalize(text);
  const m = t.match(/\b(\d{1,2}|one|two|three|four|five|six|ek|aik|do|teen|chaar|char|panch|paanch)\s*(units?|bags?|bottles?|botal|pints?|pack)\b/);
  if (!m) return undefined;
  const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMWORDS[m[1]!];
  return n && n > 0 && n <= 10 ? n : undefined;
}

export function extractAge(text: string): number | undefined {
  const t = normalize(text);
  const m = t.match(/\b(?:i am|im|i m|age|aged|umar|umr|meri umar)\s*(?:is\s*)?(\d{1,2})\b/) || t.match(/\b(\d{1,2})\s*(?:years?|yrs?|saal)\s*(?:old)?\b/);
  return m ? Number(m[1]) : undefined;
}

export function extractWeight(text: string): number | undefined {
  const m = normalize(text).match(/\b(\d{2,3})\s*(?:kg|kgs|kilo|kilos|kilograms?)\b/);
  return m ? Number(m[1]) : undefined;
}

/** "3 months ago", "last month", "2 weeks back", "yesterday" → days. */
export function extractDaysSince(text: string): number | undefined {
  const t = normalize(text);
  if (/\byesterday\b|\bkal\b/.test(t)) return 1;
  if (/\blast week\b|\bpichle hafte\b/.test(t)) return 7;
  if (/\blast month\b|\bpichle mahine\b/.test(t)) return 30;
  const m = t.match(/\b(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(days?|weeks?|months?|years?|din|hafte|mahine|saal)\s*(?:ago|back|pehle|before)?\b/);
  if (!m) return undefined;
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : words[m[1]!] ?? 1;
  const unit = m[2]!;
  const mult = /^(day|din)/.test(unit) ? 1 : /^(week|hafte)/.test(unit) ? 7 : /^(month|mahine)/.test(unit) ? 30 : 365;
  return n * mult;
}

export function extractUrgency(text: string): Entities["urgency"] {
  const t = normalize(text);
  if (/\b(critical|dying|icu|accident|serious|bohat urgent|life threatening)\b/.test(t)) return "critical";
  if (/\b(urgent|emergency|asap|now|abhi|jaldi|foran|fori|immediately|today|aaj)\b/.test(t)) return "urgent";
  if (/\b(normal|tomorrow|kal|no rush|planned|next week)\b/.test(t)) return "normal";
  return undefined;
}

export function extractAll(text: string): Entities {
  const t = normalize(text);
  const e: Entities = {};
  const bt = extractBloodType(text); if (bt) e.bloodType = bt;
  const pl = extractPlace(text); if (pl) e.place = pl;
  const u = extractUnits(text); if (u) e.units = u;
  const a = extractAge(text); if (a !== undefined) e.age = a;
  const w = extractWeight(text); if (w !== undefined) e.weightKg = w;
  const d = extractDaysSince(text); if (d !== undefined) e.daysSinceDonation = d;
  const ur = extractUrgency(text); if (ur) e.urgency = ur;
  if (/^(yes|yeah|yep|sure|ok|okay|confirm|haan|han|ji|ji haan|send|send it|go ahead|bhej do)\b/.test(t)) e.yes = true;
  if (/^(no|nope|cancel|stop|nahi|nahin|mat|don t|dont)\b/.test(t)) e.no = true;
  return e;
}
