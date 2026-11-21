import { beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "../store";

describe("store (offline, seed data)", () => {
  beforeEach(async () => { await store.resetDemo(); vi.useRealTimers(); });

  it("signs up, completes the profile and gets auto-verified with a valid CNIC", async () => {
    vi.useFakeTimers();
    await store.signUp("Test Donor", "test@donor.pk", "Secret#123");
    expect(store.currentUser()?.status).toBe("incomplete");
    store.submitForVerification({ bloodType: "O-", location: "Clifton", cnicNumber: "42101-7777777-1", isAvailable: true });
    expect(store.currentUser()?.status).toBe("pending");
    vi.advanceTimersByTime(4500);
    expect(store.currentUser()).toMatchObject({ status: "approved", cnicVerified: true });
  });

  it("ranks matching donors with the AI model when an SOS is sent, and the top donor responds", async () => {
    vi.useFakeTimers();
    await store.logIn("mariam@bloodbridge.demo", "Demo#1234");
    const { request, notified } = store.createRequest({ bloodType: "B+", location: "Gulshan-e-Iqbal", hospital: "Aga Khan University Hospital", unitsNeeded: 1, priority: "urgent" });
    expect(notified).toBeGreaterThan(0);
    const ranking = store.getDB().requests.find((r) => r.id === request.id)!.aiRanking!;
    expect(ranking.length).toBeGreaterThan(0);
    for (let i = 1; i < ranking.length; i++) expect(ranking[i - 1]!.p).toBeGreaterThanOrEqual(ranking[i]!.p);
    vi.advanceTimersByTime(6500);
    expect(store.getDB().requests.find((r) => r.id === request.id)!.responders).toContain(ranking[0]!.uid);
  });

  it("keeps the admin and donor logins separate", async () => {
    await expect(store.logIn("admin@bloodbridge.demo", "Admin#1234")).rejects.toThrow(/Admin login/);
    await expect(store.logIn("ahmed@bloodbridge.demo", "Demo#1234", true)).rejects.toThrow(/not an administrator/);
  });
});
