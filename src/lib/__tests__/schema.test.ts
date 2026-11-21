import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import * as S from "../schema";
import { seed } from "../seed";

const t = Timestamp.fromDate(new Date("2026-11-01T10:00:00Z"));

describe("Firestore schema shared with the mobile app", () => {
  it("reads a user written by the app's sign-up and profile builder", () => {
    const u = S.userFromDoc("abc", { uid: "abc", fullName: "Sara Ali", email: "s@x.pk", phone: "0300", location: "Clifton", bloodType: "O-", isAvailable: true, role: "user", status: "approved", cnicNumber: "42101-1234567-1", documents: ["data:image/jpeg;base64,AAA"], cnicVerified: true, createdAt: t });
    expect(u).toMatchObject({ uid: "abc", fullName: "Sara Ali", bloodType: "O-", status: "approved", cnicImage: "data:image/jpeg;base64,AAA", createdAt: "2026-11-01T10:00:00.000Z" });
    expect(u.lat).toBeTypeOf("number"); // located from the area name, as the app stores no coordinates
  });

  it("writes users in the app's format (Timestamp, documents[], no password)", () => {
    const seeded = seed().users[0]!;
    const d = S.userToDoc({ ...seeded, cnicImage: "data:x" });
    expect(d.password).toBeUndefined();
    expect(d.createdAt).toBeInstanceOf(Timestamp);
    expect(d.documents).toEqual(["data:x"]);
    expect(d.uid).toBe(seeded.uid);
    expect(S.userFromDoc(seeded.uid, d)).toMatchObject({ fullName: seeded.fullName, bloodType: seeded.bloodType, seeded: true });
  });

  it("maps SOS priority between the app (moderate) and the website (normal)", () => {
    const r = S.requestFromDoc("r1", { uid: "a", name: "Ali", bloodType: "B+", location: "Saddar", hospital: "Civil Hospital", unitsNeeded: "2", priority: "moderate", status: "open", createdAt: t });
    expect(r).toMatchObject({ priority: "normal", unitsNeeded: 2, responders: [] });
    const back = S.requestToDoc(r);
    expect(back.priority).toBe("moderate");
    expect(back.initials).toBe("A");
    expect(back.id).toBeUndefined();
  });

  it("round-trips donation posts with the app's coords object", () => {
    const p = S.donationFromDoc("d1", { uid: "a", name: "Ali", bloodType: "A+", location: "DHA", hospital: "", note: "", coords: { latitude: 24.8, longitude: 67.06 }, status: "active", createdAt: t });
    expect(p).toMatchObject({ lat: 24.8, lng: 67.06, status: "active" });
    expect(S.donationToDoc(p).coords).toEqual({ latitude: 24.8, longitude: 67.06 });
  });

  it("maps donation records (donationDate, recipientName, confirmationCode)", () => {
    const r = S.recordFromDoc("x", { donorUid: "a", donorName: "Ali", bloodType: "O+", hospital: "Indus", units: 1, recipientName: "Baby", donationDate: "2026-10-01", confirmationCode: "BB-1", status: "confirmed", createdAt: t });
    expect(r).toMatchObject({ date: "2026-10-01", recipient: "Baby", certificateNo: "BB-1" });
    expect(S.recordToDoc(r)).toMatchObject({ donationDate: "2026-10-01", recipientName: "Baby", confirmationCode: "BB-1", status: "confirmed" });
  });

  it("translates chat read state between readStatus (app) and unread counts (website)", () => {
    const c = S.chatFromDoc("a__b", { participants: ["a", "b"], lastMessage: "hi", lastMessageAt: t, lastSenderId: "a", readStatus: { a: true, b: false } });
    expect(c.unread).toEqual({ a: 0, b: 1 });
    expect(S.chatToDoc({ ...c, unread: { a: 2, b: 0 } }).readStatus).toEqual({ a: false, b: true });
  });

  it("links notifications from the app to the right page", () => {
    expect(S.notificationFromDoc("me", "n1", { type: "message", title: "t", body: "b", relatedId: "a__b", isRead: false, createdAt: t }).link).toBe("/chat/a__b");
    expect(S.notificationFromDoc("me", "n2", { type: "contact_request", title: "t", body: "b", createdAt: null }).link).toBe("/notifications");
  });
});
