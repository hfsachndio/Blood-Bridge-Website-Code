/**
 * Intent classifier: TF-IDF vectors over unigrams + bigrams, cosine similarity to labelled example
 * phrases (English and Roman Urdu), top-k voting, and a confidence threshold for "I don't know".
 */
import { features, tokens } from "./text";

/** Words that appear in many questions; a match on these alone is not evidence of an intent. */
const FUNCTION = new Set(["can", "how", "when", "where", "who", "what", "not", "my", "me", "do", "i", "you", "is", "need"]);

export type Intent =
  | "greet" | "thanks" | "bye" | "help" | "identity"
  | "find_donors" | "create_sos" | "open_requests" | "compatibility" | "blood_bank"
  | "eligibility" | "elig_age" | "elig_weight" | "elig_tattoo" | "elig_medication" | "elig_illness" | "elig_pregnancy" | "elig_surgery" | "elig_transfusion" | "elig_interval"
  | "before_donation" | "process" | "aftercare" | "my_status" | "points" | "privacy" | "availability_on" | "availability_off" | "log_donation";

export const TRAINING: Record<Intent, string[]> = {
  greet: ["hi", "hello", "hey there", "assalam o alaikum", "salam", "good morning", "aoa", "hello bloodbot"],
  thanks: ["thanks", "thank you", "shukriya", "thanks a lot", "jazakallah", "great thanks", "that helps"],
  bye: ["bye", "goodbye", "see you", "allah hafiz", "khuda hafiz", "talk later"],
  help: ["help", "what can you do", "how can you help me", "options", "menu", "what can i ask", "madad chahiye app kya kar sakti ho"],
  identity: ["who are you", "are you a human", "what are you", "are you a bot", "your name"],
  find_donors: [
    "find donors near me", "find b+ donor in gulshan", "i need o negative donors nearby", "search donors near clifton", "show a+ donors",
    "who can donate near saddar", "donor chahiye gulshan mein", "b positive donor kahan milega", "any ab- donors close to dha", "list donors with o+",
    "find blood donors around me", "nearby donors for a negative", "donors near aga khan hospital", "koi donor hai nazimabad mein",
  ],
  create_sos: [
    "i need blood urgently", "send an sos", "my father needs 2 units of b+ at aga khan", "emergency need o negative blood at jinnah hospital",
    "post an urgent request", "create blood request", "khoon chahiye jaldi", "mujhe 3 bottle khoon chahiye civil hospital mein", "need blood for surgery tomorrow",
    "patient needs a+ blood now", "urgent blood required at indus hospital", "raise an sos request for my mother", "request blood", "need 2 bags of blood",
  ],
  open_requests: ["show urgent requests", "who needs blood right now", "open requests near me", "any emergencies", "latest sos requests", "kis ko khoon chahiye", "requests i can help with"],
  compatibility: [
    "who can donate to b+", "can o negative give to a positive", "which blood types can receive ab+", "universal donor", "universal recipient",
    "can i donate to my brother he is a+", "which blood groups can give to o+ patient", "what groups are compatible with b-", "compatible blood types for o+", "b+ ko kaun donate kar sakta hai", "what blood can a- patient receive", "is a+ compatible with o+",
  ],
  blood_bank: ["nearest blood bank", "where is a blood bank", "blood bank near gulshan", "blood bank kahan hai", "which blood banks are open", "fatimid blood bank location", "closest blood centre"],
  eligibility: ["can i donate blood", "am i eligible to donate", "am i able to donate", "am i fit to give blood", "can i be a donor", "check my eligibility", "kya main khoon de sakta hoon", "am i allowed to donate today", "eligibility check", "can i give blood now"],
  elig_age: ["what is the age limit", "i am 16 years old can i donate", "i am 19 can i give blood", "how old do i need to be", "minimum age to donate", "i am 17 can i donate", "can a 70 year old donate", "age requirement for blood donation", "meri umar 16 hai kya main de sakta hoon", "too old to donate"],
  elig_weight: ["minimum weight to donate", "i weigh 45 kg can i donate", "weight requirement", "is 50 kg enough", "mera wazan kam hai", "underweight can i give blood"],
  elig_tattoo: ["i got a tattoo can i donate", "tattoo 3 months ago", "piercing last month donate", "does a tattoo stop me donating", "ear piercing blood donation", "tattoo ke baad khoon de sakte hain"],
  elig_medication: ["i am on medication", "can i donate while taking antibiotics", "taking medicine can i donate", "blood pressure tablets donation", "dawai le raha hoon", "on painkillers can i give blood"],
  elig_illness: ["i have a fever", "i am sick can i donate", "flu and cold donate", "mujhe bukhar hai", "i have covid", "feeling ill today", "infection can i donate"],
  elig_pregnancy: ["can i donate while pregnant", "breastfeeding blood donation", "i am pregnant", "after delivery when can i donate", "women donation during pregnancy"],
  elig_surgery: ["i had surgery", "operation last month can i donate", "after surgery when can i donate", "had an operation recently", "dental surgery donation"],
  elig_transfusion: ["i received blood last year", "had a blood transfusion", "after transfusion can i donate", "got blood in hospital can i donate"],
  elig_interval: ["how often can i donate", "gap between donations", "i donated 2 months ago can i donate again", "how many days between donations", "donate every 3 months", "last donation was 40 days ago"],
  before_donation: ["what should i do before donating", "what to eat before donation", "preparing for blood donation", "before giving blood", "donation se pehle kya karein", "should i eat before donating"],
  process: ["what happens during donation", "how long does donation take", "is donating painful", "how much blood is taken", "donation process", "does it hurt", "steps of blood donation"],
  aftercare: ["what to do after donating", "i feel tired after giving blood", "after donation care", "i feel dizzy after donating", "what to eat after giving blood", "donation ke baad kya karein", "can i exercise after donating"],
  my_status: ["when can i donate next", "my next eligible date", "my last donation", "how many times have i donated", "my donation history", "my profile status", "am i verified"],
  points: ["how do i earn points", "what are badges", "how does the leaderboard work", "how to get awards", "my points", "my rank", "what is blood hero badge"],
  privacy: ["is my number shared", "who can see my phone number", "is my data private", "privacy", "is the chat encrypted", "will people see my address"],
  availability_on: ["mark me available", "i am available to donate", "turn on availability", "set me as available", "main available hoon"],
  availability_off: ["mark me unavailable", "i am not available", "turn off availability", "pause my availability", "main available nahi hoon"],
  log_donation: ["log my donation", "i donated today", "record a donation", "add donation record", "maine aaj khoon diya", "i gave blood yesterday", "certificate for my donation"],
};

type Vec = Map<string, number>;
class TfIdf {
  idf = new Map<string, number>();
  fit(docs: string[][]) {
    const df = new Map<string, number>();
    docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
    df.forEach((n, t) => this.idf.set(t, Math.log((1 + docs.length) / (1 + n)) + 1));
    return this;
  }
  vec(doc: string[]): Vec {
    const tf = new Map<string, number>();
    doc.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    const v: Vec = new Map();
    let norm = 0;
    tf.forEach((n, t) => { const w = (1 + Math.log(n)) * (this.idf.get(t) ?? 0); if (w) { v.set(t, w); norm += w * w; } });
    norm = Math.sqrt(norm) || 1;
    v.forEach((w, t) => v.set(t, w / norm));
    return v;
  }
}
const cosine = (a: Vec, b: Vec) => { let s = 0; a.forEach((w, t) => { const o = b.get(t); if (o) s += w * o; }); return s; };

const examples = (Object.entries(TRAINING) as [Intent, string[]][]).flatMap(([intent, list]) => list.map((text) => ({ intent, f: features(text) })));
const model = new TfIdf().fit(examples.map((e) => e.f));
const vectors = examples.map((e) => ({ intent: e.intent, v: model.vec(e.f) }));

export interface Prediction { intent: Intent | "fallback"; confidence: number; ranking: { intent: Intent; score: number }[] }

export function classify(text: string, k = 3, threshold = 0.22): Prediction {
  const q = model.vec(features(text));
  const sims = vectors.map((x) => ({ intent: x.intent, s: cosine(q, x.v) })).sort((a, b) => b.s - a.s).slice(0, k);
  const score = new Map<Intent, number>();
  sims.forEach(({ intent, s }, i) => score.set(intent, (score.get(intent) ?? 0) + s * (1 - i * 0.15)));
  const ranking = [...score.entries()].map(([intent, s]) => ({ intent, score: s })).sort((a, b) => b.score - a.score);
  const top = ranking[0];
  const confidence = sims[0]?.s ?? 0;
  // Require at least one shared content word with the best example (not just "what is", "can i"...).
  const content = new Set(tokens(text).filter((t) => !FUNCTION.has(t)));
  const best = examples[vectors.findIndex((x) => x.intent === sims[0]?.intent && cosine(q, x.v) === sims[0]?.s)];
  const sharesContent = !content.size || (best?.f ?? []).some((f) => f.split("_").some((w) => content.has(w)));
  if (!top || confidence < threshold || !sharesContent) return { intent: "fallback", confidence, ranking };
  return { intent: top.intent, confidence, ranking };
}
