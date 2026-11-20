import { describe, expect, it } from "vitest";
import { measureQuality, parseCnicText } from "../cnicVision";

describe("CNIC OCR parsing", () => {
  it("finds the number, birth date and name in typical OCR output", () => {
    const text = "SAMPLE IDENTITY CARD\nName\nAyesha Khan\nGender F\nIdentity Number\n42101-1234567-1\nDate of Birth\n12.04.1996\nDate of Issue\n03.05.2021";
    expect(parseCnicText(text)).toEqual({ cnic: "42101-1234567-1", dateOfBirth: "1996-04-12", name: "Ayesha Khan" });
  });
  it("tolerates OCR mistakes: spaces, dashes and O/l read instead of 0/1", () => {
    expect(parseCnicText("Identity Number 42lO1 1234567 - 1").cnic).toBe("42101-1234567-1");
    expect(parseCnicText("no number here").cnic).toBeNull();
  });
});

describe("photo quality", () => {
  const img = (w: number, h: number, f: (x: number, y: number) => number) => { const g = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y); return g; };
  it("a sharp, well-lit, high-contrast image passes", () => {
    const q = measureQuality(img(120, 80, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 230 : 40), 120, 80);
    expect(q.ok).toBe(true);
  });
  it("a flat or dark image is flagged", () => {
    const q = measureQuality(img(120, 80, () => 30), 120, 80);
    expect(q.ok).toBe(false); expect(q.issues).toContain("Photo is too dark"); expect(q.issues).toContain("Photo looks blurry");
  });
});
