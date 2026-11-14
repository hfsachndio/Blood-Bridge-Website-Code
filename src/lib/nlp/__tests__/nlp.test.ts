import { describe, expect, it } from "vitest";
import { classify } from "../classifier";
import { extractAll, extractBloodType, extractPlace, extractUnits, extractDaysSince } from "../entities";

// Phrases NOT in the training data, to measure generalisation.
const heldOut: [string, string][] = [
  ["hey", "greet"], ["salaam bloodbot", "greet"], ["thank u so much", "thanks"],
  ["looking for an o+ donor in north nazimabad", "find_donors"], ["any b negative donors around bahadurabad?", "find_donors"],
  ["koi a+ donor mil sakta hai clifton mein", "find_donors"], ["my sister needs ab+ blood at south city hospital asap", "create_sos"],
  ["urgent: 2 bags o- required at civil hospital", "create_sos"], ["bhai ko khoon chahiye aga khan mein", "create_sos"],
  ["who needs blood near me", "open_requests"], ["which groups can give blood to a b- patient", "compatibility"],
  ["where can i find a blood bank in gulshan", "blood_bank"], ["am i able to donate", "eligibility"],
  ["i'm 16 years old can i give blood", "elig_age"], ["i only weigh 47 kg", "elig_weight"],
  ["got my nose pierced two months ago", "elig_tattoo"], ["i'm taking antibiotics this week", "elig_medication"],
  ["i have the flu", "elig_illness"], ["i'm breastfeeding my baby", "elig_pregnancy"],
  ["i had knee surgery in march", "elig_surgery"], ["i donated 50 days ago when can i donate again", "elig_interval"],
  ["what to eat before giving blood", "before_donation"], ["does donating blood hurt", "process"],
  ["i feel weak after donation what should i do", "aftercare"], ["when is my next donation date", "my_status"],
  ["how are leaderboard points calculated", "points"], ["can donors see my phone number", "privacy"],
  ["make me available for donation", "availability_on"], ["i want to log a donation i made today", "log_donation"],
];

describe("intent classifier", () => {
  it("generalises to unseen phrasing (≥ 85% accuracy)", () => {
    const wrong = heldOut.filter(([t, want]) => classify(t).intent !== want).map(([t, want]) => `${t} → ${classify(t).intent} (want ${want})`);
    const acc = 1 - wrong.length / heldOut.length;
    console.log(`held-out accuracy ${(acc * 100).toFixed(1)}%`, wrong);
    expect(acc).toBeGreaterThanOrEqual(0.85);
  });
  it("falls back on unrelated text", () => {
    expect(classify("what is the capital of france").intent).toBe("fallback");
  });
});

describe("entity extraction", () => {
  it("reads blood types in many spellings", () => {
    expect(extractBloodType("need O negative")).toBe("O-");
    expect(extractBloodType("b+ve donor")).toBe("B+");
    expect(extractBloodType("AB positive patient")).toBe("AB+");
    expect(extractBloodType("a pos")).toBe("A+");
    expect(extractBloodType("0- please")).toBe("O-");
    expect(extractBloodType("a patient")).toBeUndefined();
  });
  it("finds places with typos and aliases", () => {
    expect(extractPlace("donor in gulshen")?.name).toBe("Gulshan-e-Iqbal");
    expect(extractPlace("at jinnah hospital")?.name).toBe("Jinnah Postgraduate Medical Centre");
    expect(extractPlace("near defence")?.name).toBe("DHA");
    expect(extractPlace("aga khan")?.name).toBe("Aga Khan University Hospital");
  });
  it("reads units, durations, age and urgency", () => {
    expect(extractUnits("need 2 bags")).toBe(2);
    expect(extractUnits("teen bottle chahiye")).toBe(3);
    expect(extractDaysSince("3 months ago")).toBe(90);
    expect(extractDaysSince("two weeks back")).toBe(14);
    const e = extractAll("i am 17 and weigh 52 kg, it's urgent");
    expect(e.age).toBe(17); expect(e.weightKg).toBe(52); expect(e.urgency).toBe("urgent");
  });
});
