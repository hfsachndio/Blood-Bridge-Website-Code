/**
 * BloodBot dialogue manager. Combines the intent classifier with entity extraction, keeps
 * conversation state for multi-turn tasks (SOS slot filling, donor search follow-ups) and answers
 * from the app's own data and eligibility rules.
 */
import { BLOOD_TYPES, CAN_RECEIVE_FROM, canDonateTo, distanceKm, findPlace, fmtKm, isCompatible, nearestBloodBanks, type BloodType, type Place } from "../blood";
import { checkEligibility, daysUntilNextDonation, RULES } from "../eligibility";
import { createRequest, currentUser, getDB, leaderboard, updateProfile, type SOSRequest } from "../store";
import { classify, type Intent } from "./classifier";
import { extractAll, type Entities } from "./entities";
import { normalize } from "./text";

export interface DonorCard { uid: string; name: string; bloodType: string; area: string; km: string; available: boolean; readyNow: boolean }
export interface RequestCard { id: string; name: string; bloodType: string; hospital: string; km: string; units: number; priority: string }
export interface BotReply {
  text: string;
  chips?: string[];
  links?: { label: string; to: string }[];
  donors?: DonorCard[];
  requests?: RequestCard[];
  debug?: { intent: string; confidence: number; entities: Entities };
}

type Pending =
  | { task: "sos"; slots: { bloodType?: BloodType; place?: Place; units?: number; urgency?: SOSRequest["priority"] }; asked?: string }
  | { task: "find"; place?: Place }
  | null;

/** Keyword rules that sharpen the statistical classifier on very specific medical topics. */
const RULES_KW: [RegExp, Intent][] = [
  [/\b(dizzy|weak|faint|tired|chakkar)\b/, "aftercare"],
  [/\b(tattoo|piercing|pierced)\b/, "elig_tattoo"],
  [/\b(pregnan\w*|breastfeed\w*|hamla)\b/, "elig_pregnancy"],
  [/\b(transfusion)\b/, "elig_transfusion"],
  [/\b(surgery|operation|operated)\b/, "elig_surgery"],
  [/\b(fever|bukhar|flu|covid|sick|ill|infection)\b/, "elig_illness"],
  [/\b(antibiotic\w*|medicine|medication|tablets?|dawai)\b/, "elig_medication"],
  [/\bblood ?bank\w*\b/, "blood_bank"],
  [/\b(sos|emergency request|urgent request)\b/, "create_sos"],
];

const firstName = (n: string) => n.split(" ")[0];
const mask = (n: string) => { const [a, b] = n.split(" "); return b ? `${a} ${b[0]}.` : a!; };

export class BloodBot {
  private pending: Pending = null;

  greeting(): BotReply {
    const me = currentUser();
    return {
      text: `Hi${me ? " " + firstName(me.fullName) : ""}! I'm **BloodBot**. I understand English and Roman Urdu. I can find compatible donors, post an SOS, check if you can donate, and answer blood donation questions.`,
      chips: ["Find B+ donors near Gulshan", "I need 2 units O- at Jinnah Hospital", "Can I donate after a tattoo?", "When can I donate next?"],
    };
  }

  reply(input: string): BotReply {
    const text = input.trim();
    if (!text) return { text: "Type a question or pick one of the suggestions." };
    const e = extractAll(text);
    const norm = normalize(text);

    // Continue an ongoing task first (multi-turn slot filling).
    if (this.pending) {
      if (/^(cancel|stop|never mind|nevermind|rehne do|chhoro)\b/.test(norm) || e.no && this.pending.task === "sos" && this.pending.asked === "confirm") {
        this.pending = null; return { text: "Okay, I've cancelled that. Anything else?", chips: ["Find donors", "Nearest blood bank"] };
      }
      if (this.pending.task === "sos") return this.continueSos(e, text);
      if (this.pending.task === "find" && e.bloodType) { const place = e.place ?? this.pending.place; this.pending = null; return this.findDonors(e.bloodType, place); }
    }

    let { intent, confidence } = classify(text);
    const kw = RULES_KW.find(([re]) => re.test(norm));
    if (kw && (intent === "fallback" || intent === "eligibility" || confidence < 0.45)) intent = kw[1];
    // If the model is unsure but the message names a blood type, treat it as a donor search or compatibility question.
    if (intent === "fallback" && e.bloodType) intent = /\b(give|receive|compatible|to)\b/.test(norm) ? "compatibility" : "find_donors";
    // A question that gives an age or weight is answered with that specific rule.
    if ((intent === "eligibility" || intent === "fallback") && e.age !== undefined) intent = "elig_age";
    else if ((intent === "eligibility" || intent === "fallback") && e.weightKg !== undefined) intent = "elig_weight";
    const out = this.handle(intent as Intent | "fallback", e, text);
    out.debug = { intent, confidence: Math.round(confidence * 100) / 100, entities: e };
    return out;
  }

  private handle(intent: Intent | "fallback", e: Entities, text: string): BotReply {
    const me = currentUser();
    switch (intent) {
      case "greet": return this.greeting();
      case "thanks": return { text: "You're welcome! Every donation can save up to three lives. 💙", chips: ["Show urgent requests", "My next donation date"] };
      case "bye": return { text: "Allah Hafiz! Stay safe, and thank you for being part of Blood Bridge." };
      case "identity": return { text: "I'm BloodBot, Blood Bridge's assistant. I run entirely in your browser using natural-language processing: an intent classifier plus entity recognition for blood types, places, units and dates." };
      case "help": return { text: "Here's what I can do:\n• **Find donors**: \"find O- donors near Clifton\"\n• **Post an SOS**: \"need 2 units B+ at Aga Khan, urgent\"\n• **Eligibility**: \"I'm 17, can I donate?\", \"tattoo 2 months ago\"\n• **Compatibility**: \"who can donate to AB-?\"\n• **Your status**: \"when can I donate next?\"\n• **Blood banks**: \"nearest blood bank to Saddar\"", chips: ["Find donors", "Send an SOS", "Am I eligible?"] };

      case "find_donors": {
        const bt = e.bloodType;
        if (!bt) { this.pending = { task: "find", ...(e.place ? { place: e.place } : {}) }; return { text: "Which blood type does the patient need?", chips: [...BLOOD_TYPES] }; }
        return this.findDonors(bt, e.place);
      }
      case "create_sos": {
        if (!me || me.status !== "approved") return { text: "You need a verified account to post an SOS. Please log in and complete your profile first.", links: [{ label: "Log in", to: "/login" }] };
        this.pending = { task: "sos", slots: { ...(e.bloodType ? { bloodType: e.bloodType } : {}), ...(e.place ? { place: e.place } : {}), ...(e.units ? { units: e.units } : {}), ...(e.urgency ? { urgency: e.urgency } : {}) } };
        return this.continueSos({}, text);
      }
      case "open_requests": return this.openRequests();
      case "compatibility": {
        const bt = e.bloodType ?? me?.bloodType;
        if (!bt) return { text: "Tell me a blood type, e.g. \"who can donate to B+?\"", chips: ["Who can donate to AB-?", "Universal donor?"] };
        if (/universal donor/.test(normalize(text))) return { text: "**O-** is the universal red-cell donor: it can be given to every blood type. **AB+** is the universal recipient." };
        return { text: `**${bt}** patients can receive from: ${CAN_RECEIVE_FROM[bt].join(", ")}.\n**${bt}** donors can give to: ${canDonateTo(bt).join(", ")}.`, chips: [`Find ${bt} donors`, "Universal donor?"] };
      }
      case "blood_bank": {
        const from = e.place ?? (me?.lat ? { lat: me.lat, lng: me.lng!, name: me.location ?? "you" } as Place : findPlace("Saddar")!);
        const list = nearestBloodBanks(from);
        return { text: `Nearest blood banks to **${from.name}**:\n${list.map((b, i) => `${i + 1}. ${b.name} · ${fmtKm(b.km)}`).join("\n")}\nCall ahead to confirm stock for the blood type you need.`, links: [{ label: "Open map", to: "/search" }] };
      }

      case "eligibility": {
        if (!me || !me.dateOfBirth) return { text: `The basics: age **${RULES.MIN_AGE}–${RULES.MAX_AGE}**, weight at least **${RULES.MIN_WEIGHT_KG} kg**, feeling well, and **${RULES.MIN_DAYS_BETWEEN_DONATIONS} days** since your last whole-blood donation. Take the full check for a personal answer.`, links: [{ label: "Open eligibility checker", to: "/eligibility" }] };
        const r = checkEligibility({ dateOfBirth: me.dateOfBirth, weight: me.weight ?? 0, ...(me.lastDonationDate ? { lastDonationDate: me.lastDonationDate } : {}), hasFever: false, hasIllness: false, hadSurgeryRecently: false, isOnMedication: false, hadTattooOrPiercing: false, isPregnantOrBreastfeeding: false, hadBloodTransfusion: false });
        return { text: `Based on your profile: **${r.title}**\n${r.message}${r.nextEligibleDate ? `\nNext eligible date: **${r.nextEligibleDate}**.` : ""}\nThe health questions aren't part of your profile, so please confirm them in the checker.`, links: [{ label: "Answer health questions", to: "/eligibility" }] };
      }
      case "elig_age": {
        if (e.age !== undefined) {
          if (e.age < RULES.MIN_AGE) return { text: `At **${e.age}** you can't donate yet. The minimum age is **${RULES.MIN_AGE}**. You can still help by sharing requests with family and friends. 💪` };
          if (e.age > RULES.MAX_AGE) return { text: `At **${e.age}**, donors above ${RULES.MAX_AGE} need a doctor's clearance first. With it, many healthy older donors can still give.` };
          return { text: `Age **${e.age}** is within the allowed range (${RULES.MIN_AGE}–${RULES.MAX_AGE}). ✅ Weight and health also matter.`, links: [{ label: "Full eligibility check", to: "/eligibility" }] };
        }
        return { text: `Donors must be **${RULES.MIN_AGE}–${RULES.MAX_AGE}** years old. Above ${RULES.MAX_AGE}, a doctor's clearance is required.` };
      }
      case "elig_weight": {
        if (e.weightKg !== undefined) return e.weightKg >= RULES.MIN_WEIGHT_KG ? { text: `**${e.weightKg} kg** meets the minimum of ${RULES.MIN_WEIGHT_KG} kg. ✅` } : { text: `**${e.weightKg} kg** is below the minimum of **${RULES.MIN_WEIGHT_KG} kg**, so donating isn't safe for you right now.` };
        return { text: `You need to weigh at least **${RULES.MIN_WEIGHT_KG} kg** to donate whole blood safely.` };
      }
      case "elig_tattoo": return this.deferral(e, 180, "a tattoo or piercing", "6 months");
      case "elig_surgery": return this.deferral(e, 180, "surgery", "6 months");
      case "elig_transfusion": return this.deferral(e, 365, "a blood transfusion", "12 months");
      case "elig_medication": return { text: "Some medicines affect eligibility (for example antibiotics, blood thinners and acne medication). It's a **medical review** case: please check with your doctor before donating. Common vitamins and most blood pressure tablets are usually fine.", links: [{ label: "Eligibility checker", to: "/eligibility" }] };
      case "elig_illness": return { text: "Please don't donate while you have a **fever, flu or an active infection**. Wait until you've been well for at least 7 days, and 14 days after finishing antibiotics. 🤒" };
      case "elig_pregnancy": return { text: "You **cannot donate while pregnant or breastfeeding**. Most guidelines suggest waiting at least 6 months after delivery and after you stop breastfeeding." };
      case "elig_interval": {
        if (e.daysSinceDonation !== undefined) {
          const left = RULES.MIN_DAYS_BETWEEN_DONATIONS - e.daysSinceDonation;
          return left > 0 ? { text: `You donated about **${e.daysSinceDonation} days** ago. Please wait **${left} more days** (whole blood needs ${RULES.MIN_DAYS_BETWEEN_DONATIONS} days between donations).` } : { text: `It's been **${e.daysSinceDonation} days**, more than the ${RULES.MIN_DAYS_BETWEEN_DONATIONS}-day gap, so you can donate again. ✅` };
        }
        return { text: `Whole blood: once every **${RULES.MIN_DAYS_BETWEEN_DONATIONS} days** (about 3 months). Your body replaces the plasma in a day and red cells in a few weeks.`, chips: ["When can I donate next?"] };
      }
      case "before_donation": return { text: "Before donating:\n• Sleep well the night before\n• Eat a healthy meal 2–3 hours before (avoid fatty food)\n• Drink an extra 500 ml of water\n• Bring your CNIC\n• Wear a shirt with sleeves that roll up easily" };
      case "process": return { text: "The donation itself takes **8–10 minutes** (about 45 minutes including registration and the mini check-up). About **450 ml** is collected. You'll feel a quick pinch, then rest and have juice for 10–15 minutes." };
      case "aftercare": return { text: "After donating:\n• Rest 10–15 minutes and have a snack\n• Drink plenty of fluids for 24 hours\n• Skip heavy exercise and lifting for the day\n• Keep the bandage on for a few hours\n• Feeling dizzy? Lie down and raise your feet. 🧃" };
      case "my_status": {
        if (!me) return { text: "Log in to see your donation status.", links: [{ label: "Log in", to: "/login" }] };
        const left = daysUntilNextDonation(me.lastDonationDate);
        const records = getDB().records.filter((r) => r.donorUid === me.uid).length;
        return { text: `**${me.fullName}** · ${me.bloodType ?? "blood type not set"} · ${me.status === "approved" ? "verified ✅" : me.status}\nDonations logged: **${records}**\n${me.lastDonationDate ? `Last donation: **${me.lastDonationDate}**. ` : ""}${left > 0 ? `You can donate again in **${left} days**.` : "You can donate now. 🩸"}`, links: [{ label: "Donation history", to: "/history" }] };
      }
      case "points": {
        const lb = leaderboard(); const idx = me ? lb.findIndex((x) => x.user.uid === me.uid) : -1;
        return { text: `You earn **100 points** per donation post and **150 points** per confirmed donation. Badges: 🩸 First Drop (1), 💉 Life Saver (3), 🦸 Blood Hero (5), 🏆 Champion (10), 👑 Legend (20).${idx >= 0 ? `\nYou're **#${idx + 1}** with **${lb[idx]!.points} points**.` : ""}`, links: [{ label: "Leaderboard", to: "/leaderboard" }] };
      }
      case "privacy": return { text: "Your phone number and exact address are **never shown** to other users. People contact you through in-app chat, and you choose what to share. Only verified (CNIC-checked) users can post or respond." };
      case "availability_on": if (me) { updateProfile({ isAvailable: true }); return { text: "Done. You're now **available**, and you'll get SOS alerts for compatible requests near you. ✅" }; } return { text: "Please log in first." };
      case "availability_off": if (me) { updateProfile({ isAvailable: false }); return { text: "Done. You're **unavailable**, so you won't get SOS alerts until you turn it back on." }; } return { text: "Please log in first." };
      case "log_donation": return { text: "Great, thank you! 🩸 Log it to update your history, earn 150 points and get a certificate.", links: [{ label: "Log a donation", to: "/log-donation" }] };
      default:
        return { text: "Sorry, I didn't quite get that. Try asking about donors, an SOS, eligibility or blood banks.", chips: ["What can you do?", "Find donors near me", "Can I donate?"] };
    }
  }

  private deferral(e: Entities, days: number, what: string, label: string): BotReply {
    if (e.daysSinceDonation !== undefined) {
      const left = days - e.daysSinceDonation;
      return left > 0
        ? { text: `After ${what}, you need to wait **${label}**. You're about **${left} days** away from being eligible.` }
        : { text: `It's been more than ${label} since ${what}, so that's no longer a reason to wait. ✅`, links: [{ label: "Full eligibility check", to: "/eligibility" }] };
    }
    return { text: `After ${what}, please wait **${label}** before donating. How long ago was it? (e.g. "3 months ago")` };
  }

  private findDonors(bt: BloodType, place?: Place): BotReply {
    const me = currentUser();
    const from = place ?? (me?.lat ? { name: me.location ?? "your location", lat: me.lat, lng: me.lng! } : findPlace("Saddar")!);
    const donors = getDB().users
      .filter((u) => u.role === "user" && u.status === "approved" && u.uid !== me?.uid && u.bloodType && u.lat && isCompatible(u.bloodType, bt))
      .map((u) => ({ u, km: distanceKm(from, { lat: u.lat!, lng: u.lng! }) }))
      .sort((a, b) => Number(b.u.isAvailable) - Number(a.u.isAvailable) || a.km - b.km)
      .slice(0, 5);
    if (!donors.length) return { text: `I couldn't find compatible donors for **${bt}** near ${from.name}. Post an SOS so donors further away get alerted.`, chips: [`Send SOS for ${bt}`] };
    return {
      text: `Found **${donors.length} compatible donors** for **${bt}** near **${from.name}** (exact ${bt} and other compatible types):`,
      donors: donors.map(({ u, km }) => ({ uid: u.uid, name: mask(u.fullName), bloodType: u.bloodType!, area: u.location ?? "", km: fmtKm(km), available: !!u.isAvailable, readyNow: daysUntilNextDonation(u.lastDonationDate) === 0 })),
      chips: [`Send SOS for ${bt}`],
      links: [{ label: "Open map search", to: `/search?type=${encodeURIComponent(bt)}` }],
    };
  }

  private openRequests(): BotReply {
    const me = currentUser();
    const list = getDB().requests.filter((r) => r.status === "open" && r.uid !== me?.uid && (!me?.bloodType || isCompatible(me.bloodType, r.bloodType)))
      .map((r) => ({ r, km: me?.lat ? distanceKm({ lat: me.lat, lng: me.lng! }, r) : 0 }))
      .sort((a, b) => a.km - b.km).slice(0, 4);
    if (!list.length) return { text: "No open requests match your blood type right now. I'll alert you when one comes in. 🙏" };
    return {
      text: me?.bloodType ? `Open requests you can help with as **${me.bloodType}**:` : "Latest open requests:",
      requests: list.map(({ r, km }) => ({ id: r.id, name: mask(r.name), bloodType: r.bloodType, hospital: r.hospital, km: fmtKm(km), units: r.unitsNeeded, priority: r.priority })),
      links: [{ label: "All requests", to: "/requests" }],
    };
  }

  private continueSos(e: Entities, raw: string): BotReply {
    const p = this.pending as Extract<Pending, { task: "sos" }>;
    const s = p.slots;
    if (e.bloodType) s.bloodType = e.bloodType;
    if (e.place) s.place = e.place;
    if (e.units) s.units = e.units;
    else if (p.asked === "units") { const n = parseInt(raw, 10); if (n > 0 && n <= 10) s.units = n; }
    if (e.urgency) s.urgency = e.urgency;
    else if (p.asked === "urgency") { const t = normalize(raw); s.urgency = /crit/.test(t) ? "critical" : /normal|not/.test(t) ? "normal" : "urgent"; }

    if (p.asked === "confirm" && e.yes) {
      this.pending = null;
      const { request, notified } = createRequest({ bloodType: s.bloodType!, location: s.place!.name, hospital: s.place!.name, unitsNeeded: s.units!, priority: s.urgency! });
      return { text: `🚨 **SOS posted.** ${request.unitsNeeded} unit(s) of **${request.bloodType}** at **${request.hospital}**. I alerted **${notified} compatible donors** nearby. You'll get a notification and a chat when someone responds.`, links: [{ label: "View my request", to: "/requests" }, { label: "Nearest blood banks", to: "/search" }] };
    }
    if (!s.bloodType) { p.asked = "bloodType"; return { text: "Which blood type is needed?", chips: [...BLOOD_TYPES] }; }
    if (!s.place) { p.asked = "place"; return { text: "Which hospital or area? (e.g. Aga Khan, Jinnah Hospital, Gulshan)", chips: ["Aga Khan University Hospital", "Jinnah Postgraduate Medical Centre", "Civil Hospital Karachi", "Indus Hospital"] }; }
    if (!s.units) { p.asked = "units"; return { text: "How many units (bags) are needed?", chips: ["1 unit", "2 units", "3 units", "4 units"] }; }
    if (!s.urgency) { p.asked = "urgency"; return { text: "How urgent is it?", chips: ["Critical", "Urgent", "Normal"] }; }
    p.asked = "confirm";
    return { text: `Please confirm the SOS:\n• Blood type: **${s.bloodType}**\n• Place: **${s.place.name}**\n• Units: **${s.units}**\n• Urgency: **${s.urgency}**\nShall I send it to compatible donors nearby?`, chips: ["Yes, send it", "Cancel"] };
  }
}
