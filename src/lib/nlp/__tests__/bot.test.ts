import { beforeEach, describe, expect, it } from "vitest";
import { BloodBot } from "../bot";
import { getDB, logIn, logOut, resetDemo } from "../../store";
import { isCompatible } from "../../blood";

describe("BloodBot conversations", () => {
  beforeEach(async () => { await resetDemo(); await logOut(); await logIn("ahmed@bloodbridge.demo", "Demo#1234"); });

  it("creates an SOS through multi-turn slot filling (Roman Urdu)", () => {
    const bot = new BloodBot();
    const before = getDB().requests.length;
    expect(bot.reply("mujhe khoon chahiye jaldi").text).toMatch(/Which blood type/);
    expect(bot.reply("O-").text).toMatch(/Which hospital/);
    expect(bot.reply("jinnah hospital").text).toMatch(/How many units/);
    expect(bot.reply("2").text).toMatch(/Please confirm/);
    const done = bot.reply("yes send it");
    expect(done.text).toMatch(/SOS posted/);
    const r = getDB().requests[0]!;
    expect(getDB().requests.length).toBe(before + 1);
    expect([r.bloodType, r.unitsNeeded, r.priority, r.hospital]).toEqual(["O-", 2, "urgent", "Jinnah Postgraduate Medical Centre"]);
  });

  it("fills several slots from one sentence and can be cancelled", () => {
    const bot = new BloodBot();
    expect(bot.reply("my father needs 3 units of AB+ at Aga Khan, critical").text).toMatch(/Please confirm[\s\S]*AB\+[\s\S]*Aga Khan[\s\S]*3[\s\S]*critical/);
    expect(bot.reply("cancel").text).toMatch(/cancelled/);
  });

  it("finds only compatible donors, nearest first", () => {
    const r = new BloodBot().reply("find donors for A- near Gulshan");
    expect(r.donors?.length).toBeGreaterThan(0);
    r.donors!.forEach((d) => expect(isCompatible(d.bloodType as never, "A-")).toBe(true));
  });

  it("asks for the blood type when missing, then searches", () => {
    const bot = new BloodBot();
    expect(bot.reply("find donors near clifton").text).toMatch(/Which blood type/);
    expect(bot.reply("B+").donors?.length).toBeGreaterThan(0);
  });

  it("answers eligibility rules with numbers from the user's message", () => {
    const bot = new BloodBot();
    expect(bot.reply("I'm 17, can I donate?").text).toMatch(/minimum age is \*\*18/);
    expect(bot.reply("got a tattoo 2 months ago").text).toMatch(/about \*\*120 days\*\* away/);
    expect(bot.reply("i donated 100 days ago, can i donate again?").text).toMatch(/can donate again/);
    expect(bot.reply("who can donate to B-").text).toMatch(/B-, O-/);
  });
});
