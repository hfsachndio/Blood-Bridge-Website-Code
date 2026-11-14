export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

/** Which donor types a patient of each type can receive red cells from. */
export const CAN_RECEIVE_FROM: Record<BloodType, BloodType[]> = {
  "O-": ["O-"],
  "O+": ["O+", "O-"],
  "A-": ["A-", "O-"],
  "A+": ["A+", "A-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "AB-": ["AB-", "A-", "B-", "O-"],
  "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
};
export const canDonateTo = (donor: BloodType): BloodType[] =>
  BLOOD_TYPES.filter((p) => CAN_RECEIVE_FROM[p].includes(donor));
export const isCompatible = (donor: BloodType, patient: BloodType) => CAN_RECEIVE_FROM[patient].includes(donor);

export type Place = { name: string; lat: number; lng: number; aliases?: string[] };

/** Karachi neighbourhoods used for locations, search and the chatbot's place recognition. */
export const AREAS: Place[] = [
  { name: "Saddar", lat: 24.8556, lng: 67.0254 },
  { name: "Clifton", lat: 24.8138, lng: 67.0300 },
  { name: "DHA", lat: 24.8048, lng: 67.0645, aliases: ["defence", "dha phase", "defense"] },
  { name: "PECHS", lat: 24.8691, lng: 67.0630, aliases: ["tariq road"] },
  { name: "Gulshan-e-Iqbal", lat: 24.9207, lng: 67.0930, aliases: ["gulshan", "gulshan e iqbal"] },
  { name: "Gulistan-e-Jauhar", lat: 24.9180, lng: 67.1310, aliases: ["jauhar", "johar", "gulistan e johar"] },
  { name: "North Nazimabad", lat: 24.9420, lng: 67.0350, aliases: ["north nazimabad", "n nazimabad"] },
  { name: "Nazimabad", lat: 24.9147, lng: 67.0316 },
  { name: "FB Area", lat: 24.9325, lng: 67.0750, aliases: ["federal b area", "fb area", "f.b area"] },
  { name: "Bahadurabad", lat: 24.8835, lng: 67.0705 },
  { name: "Korangi", lat: 24.8300, lng: 67.1300 },
  { name: "Malir", lat: 24.8930, lng: 67.2050 },
  { name: "Lyari", lat: 24.8610, lng: 66.9950 },
  { name: "Gulberg", lat: 24.9330, lng: 67.0680 },
  { name: "Shah Faisal Colony", lat: 24.8810, lng: 67.1610, aliases: ["shah faisal"] },
  { name: "Scheme 33", lat: 24.9700, lng: 67.1300 },
];

/** Hospitals and blood banks (real Karachi institutions). */
export const HOSPITALS: Place[] = [
  { name: "Aga Khan University Hospital", lat: 24.8921, lng: 67.0745, aliases: ["aga khan", "akuh"] },
  { name: "Jinnah Postgraduate Medical Centre", lat: 24.8516, lng: 67.0451, aliases: ["jinnah hospital", "jpmc"] },
  { name: "Civil Hospital Karachi", lat: 24.8597, lng: 67.0104, aliases: ["civil hospital", "chk"] },
  { name: "Liaquat National Hospital", lat: 24.8936, lng: 67.0717, aliases: ["liaquat national", "lnh"] },
  { name: "Indus Hospital", lat: 24.8463, lng: 67.1361, aliases: ["indus"] },
  { name: "South City Hospital", lat: 24.8243, lng: 67.0339, aliases: ["south city"] },
  { name: "Dr. Ziauddin Hospital", lat: 24.8167, lng: 67.0228, aliases: ["ziauddin"] },
  { name: "Patel Hospital", lat: 24.9113, lng: 67.0900, aliases: ["patel"] },
  { name: "Dow University Hospital", lat: 24.9348, lng: 67.1525, aliases: ["dow", "duhs"] },
];
export const BLOOD_BANKS: Place[] = [
  { name: "Fatimid Foundation Blood Bank", lat: 24.8775, lng: 67.0393, aliases: ["fatimid"] },
  { name: "Husaini Blood Bank", lat: 24.8806, lng: 67.0622, aliases: ["husaini"] },
  { name: "NIBD Blood Bank", lat: 24.9210, lng: 67.0940, aliases: ["nibd", "national institute of blood disease"] },
  { name: "Indus Hospital Blood Centre", lat: 24.8463, lng: 67.1361 },
];
export const ALL_PLACES = [...AREAS, ...HOSPITALS, ...BLOOD_BANKS];
export const findPlace = (name?: string) => (name ? ALL_PLACES.find((p) => p.name.toLowerCase() === name.toLowerCase()) : undefined);

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export function nearestBloodBanks(from: { lat: number; lng: number }, n = 3) {
  return [...BLOOD_BANKS].map((b) => ({ ...b, km: distanceKm(from, b) })).sort((x, y) => x.km - y.km).slice(0, n);
}
