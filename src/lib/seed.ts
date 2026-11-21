/** Demo seed shared by the offline/test store and the admin "Load demo community" action. */
import { AREAS, HOSPITALS, findPlace, type BloodType } from "./blood";
import type { DB, DonationPost, DonationRecord, SOSRequest, User } from "./store";

const ago = (days: number, hours = 0) => new Date(Date.now() - days * 864e5 - hours * 36e5).toISOString();
export const SEED_VERSION = 1;

export function seed(): DB {
  const area = (n: string) => findPlace(n) ?? AREAS[0]!;
  const donor = (id: string, fullName: string, bloodType: BloodType, loc: string, opts: Partial<User> = {}): User => {
    const a = area(loc);
    return {
      uid: id, email: `${fullName.split(" ")[0]!.toLowerCase()}@bloodbridge.demo`, password: "Demo#1234", fullName, role: "user", status: "approved", bloodType,
      location: a.name, lat: a.lat + (Math.random() - 0.5) * 0.01, lng: a.lng + (Math.random() - 0.5) * 0.01, isAvailable: true,
      dateOfBirth: "1996-04-12", weight: 68, gender: "Male", cnicVerified: true, cnicNumber: "42101-1234567-1", totalDonations: 0,
      createdAt: ago(120), seeded: true, ...opts,
    };
  };
  const users: User[] = [
    donor("u-ahmed", "Ahmed Khan", "B+", "Gulshan-e-Iqbal", { totalDonations: 6, lastDonationDate: ago(140).slice(0, 10) }),
    donor("u-zara", "Zara Siddiqui", "O-", "Clifton", { gender: "Female", weight: 58, totalDonations: 4, lastDonationDate: ago(200).slice(0, 10) }),
    donor("u-hamza", "Hamza Noor", "B+", "PECHS", { totalDonations: 9, lastDonationDate: ago(95).slice(0, 10) }),
    donor("u-sana", "Sana Rauf", "B-", "Bahadurabad", { gender: "Female", weight: 55, totalDonations: 2, lastDonationDate: ago(40).slice(0, 10) }),
    donor("u-usman", "Usman Ali", "O-", "Saddar", { totalDonations: 12, lastDonationDate: ago(120).slice(0, 10) }),
    donor("u-ayesha", "Ayesha Malik", "A+", "DHA", { gender: "Female", weight: 60, totalDonations: 3 }),
    donor("u-bilal", "Bilal Tariq", "O+", "North Nazimabad", { totalDonations: 7, lastDonationDate: ago(180).slice(0, 10) }),
    donor("u-mariam", "Mariam Iqbal", "AB+", "Gulistan-e-Jauhar", { gender: "Female", weight: 57, totalDonations: 1 }),
    donor("u-fahad", "Fahad Sheikh", "A-", "FB Area", { totalDonations: 5, isAvailable: false }),
    donor("u-hira", "Hira Javed", "O+", "Nazimabad", { gender: "Female", weight: 54, totalDonations: 2, lastDonationDate: ago(20).slice(0, 10) }),
    donor("u-kashif", "Kashif Raza", "AB-", "Korangi", { totalDonations: 3 }),
    donor("u-nimra", "Nimra Shah", "B+", "Gulberg", { gender: "Female", weight: 59, totalDonations: 1 }),
    donor("u-imran", "Imran Qureshi", "A+", "Malir", { totalDonations: 8, lastDonationDate: ago(300).slice(0, 10) }),
    donor("u-danish", "Danish Abbasi", "O+", "Shah Faisal Colony", { totalDonations: 0 }),
    { uid: "u-admin", email: "admin@bloodbridge.demo", password: "Admin#1234", fullName: "Blood Bridge Admin", role: "admin", status: "approved", createdAt: ago(300), seeded: true },
    donor("u-pending", "Raheel Ahmed", "A+", "Lyari", { status: "pending", cnicVerified: false, cnicNumber: "42301-7654321-3", totalDonations: 0, createdAt: ago(0, 3) }),
  ];
  const H = (n: string) => HOSPITALS.find((h) => h.name.includes(n))!;
  const req = (id: string, u: User, bloodType: BloodType, hosp: string, units: number, priority: SOSRequest["priority"], hoursAgo: number, responders: string[] = []): SOSRequest => {
    const h = H(hosp);
    return { id, uid: u.uid, name: u.fullName, bloodType, location: u.location ?? "Karachi", hospital: h.name, lat: h.lat, lng: h.lng, unitsNeeded: units, priority, status: "open", responders, createdAt: ago(0, hoursAgo) };
  };
  const by = (id: string) => users.find((u) => u.uid === id)!;
  const requests: SOSRequest[] = [
    req("r1", by("u-mariam"), "B+", "Aga Khan", 2, "critical", 1, ["u-hamza"]),
    req("r2", by("u-bilal"), "O-", "Jinnah", 3, "urgent", 4),
    req("r3", by("u-ayesha"), "A+", "South City", 1, "normal", 9, ["u-imran"]),
    req("r4", by("u-kashif"), "AB-", "Indus", 2, "urgent", 20),
  ];
  const post = (id: string, u: User, hosp: string, note: string, daysAgo: number): DonationPost => {
    const h = H(hosp);
    return { id, uid: u.uid, name: u.fullName, bloodType: u.bloodType!, location: u.location!, hospital: h.name, note, lat: u.lat!, lng: u.lng!, status: "active", createdAt: ago(daysAgo) };
  };
  const donations: DonationPost[] = [
    post("d1", by("u-zara"), "Ziauddin", "Available on weekdays after 5 pm. Number hidden — message me here.", 1),
    post("d2", by("u-usman"), "Civil Hospital", "Happy to help with emergencies near Saddar.", 2),
    post("d3", by("u-ahmed"), "Patel", "Can come within an hour in Gulshan.", 3),
    post("d4", by("u-hamza"), "Liaquat National", "Regular donor, B+.", 6),
    post("d5", by("u-bilal"), "Dow University", "Weekends only.", 8),
  ];
  const rec = (id: string, u: User, hosp: string, daysAgo: number, recipient?: string): DonationRecord => ({
    id, donorUid: u.uid, donorName: u.fullName, bloodType: u.bloodType!, hospital: H(hosp).name, units: 1, date: ago(daysAgo).slice(0, 10), certificateNo: "BB-" + id.toUpperCase(), createdAt: ago(daysAgo), ...(recipient ? { recipient } : {}),
  });
  const records: DonationRecord[] = [];
  users.filter((u) => u.role === "user" && u.status === "approved").forEach((u) => {
    for (let i = 0; i < Math.min(u.totalDonations ?? 0, 6); i++) records.push(rec(`${u.uid}-${i}`, u, ["Aga Khan", "Jinnah", "Civil Hospital", "Indus", "Liaquat National", "Patel"][i % 6]!, 100 + i * 110));
  });
  return { version: SEED_VERSION, users, requests, donations, records, chats: [], messages: [], notifications: [], session: null };
}

