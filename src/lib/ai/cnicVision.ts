// Computer-vision check of a CNIC photo, entirely in the browser:
// 1) image quality (brightness, contrast, sharpness via variance of the Laplacian),
// 2) preprocessing (grayscale, contrast stretch, 2× upscale) and OCR with Tesseract's LSTM model (self-hosted, no API key),
// 3) parsing the CNIC number, name and date of birth, and comparing them with what the user typed.

export interface Quality { brightness: number; contrast: number; sharpness: number; ok: boolean; issues: string[] }
export interface CnicReading {
  quality: Quality; text: string; confidence: number;
  cnic: string | null; dateOfBirth: string | null; name: string | null;
  matchesTyped: boolean | null; ms: number;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

function grayscale(img: HTMLImageElement, width: number) {
  const scale = width / img.naturalWidth, h = Math.round(img.naturalHeight * scale);
  const c = document.createElement("canvas"); c.width = width; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, width, h);
  const { data } = ctx.getImageData(0, 0, width, h);
  const g = new Float32Array(width * h);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return { g, w: width, h, canvas: c, ctx };
}

/** Brightness and contrast (mean / std of luminance) and sharpness (variance of the 4-neighbour Laplacian). */
export function measureQuality(g: Float32Array, w: number, h: number): Quality {
  let sum = 0, clipped = 0; for (const v of g) { sum += v; if (v >= 250) clipped++; } const mean = sum / g.length;
  let sq = 0; for (const v of g) sq += (v - mean) ** 2; const std = Math.sqrt(sq / g.length);
  let ls = 0, ls2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; const lap = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
    ls += lap; ls2 += lap * lap; n++;
  }
  const sharpness = n ? ls2 / n - (ls / n) ** 2 : 0;
  const issues: string[] = [];
  if (mean < 60) issues.push("Photo is too dark");
  // A pale green card is bright but fine; overexposure means glare: a large share of pure-white pixels.
  if (clipped / g.length > 0.3 || mean > 245) issues.push("Photo is overexposed");
  if (std < 25) issues.push("Low contrast");
  if (sharpness < 60) issues.push("Photo looks blurry");
  return { brightness: Math.round(mean), contrast: Math.round(std), sharpness: Math.round(sharpness), ok: issues.length === 0, issues };
}

/** CNIC number, date of birth and name from OCR text (tolerant of OCR mistakes like O→0, l→1). */
export function parseCnicText(text: string) {
  const fixed = text.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0").replace(/(?<=\d)[lI|]|[lI|](?=\d)/g, "1");
  const m = fixed.match(/(\d{5})\s*[-–—~.]?\s*(\d{7})\s*[-–—~.]?\s*(\d)(?!\d)/);
  const cnic = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  const dates = [...fixed.matchAll(/\b(\d{2})[./-](\d{2})[./-](\d{4})\b/g)].map((d) => ({ iso: `${d[3]}-${d[2]}-${d[1]}`, y: Number(d[3]) }));
  const dob = dates.length ? dates.sort((a, b) => a.y - b.y)[0].iso : null; // the oldest date on the card is the birth date
  const nm = text.match(/Name[ \t]*[:\n]?[ \t]*([A-Z][A-Za-z]+(?:[ \t]+[A-Z][A-Za-z]+){0,3})/);
  return { cnic, dateOfBirth: dob, name: nm ? nm[1].trim() : null };
}

let worker: Promise<import("tesseract.js").Worker> | null = null;
async function ocrWorker() {
  worker ??= import("tesseract.js").then(({ createWorker }) =>
    createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr", gzip: true }));
  return worker;
}

export async function readCnic(src: string, typedCnic?: string): Promise<CnicReading> {
  const t0 = performance.now();
  const img = await loadImage(src);
  const q = grayscale(img, Math.min(900, img.naturalWidth || 900));
  const quality = measureQuality(q.g, q.w, q.h);
  // preprocessing for OCR: contrast-stretched grayscale at 2× size
  let lo = 255, hi = 0; for (const v of q.g) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const big = document.createElement("canvas"); big.width = q.w * 2; big.height = q.h * 2;
  const id = q.ctx.createImageData(q.w, q.h);
  for (let i = 0; i < q.g.length; i++) { const v = ((q.g[i] - lo) / Math.max(1, hi - lo)) * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  q.ctx.putImageData(id, 0, 0);
  const bctx = big.getContext("2d")!; bctx.imageSmoothingQuality = "high"; bctx.drawImage(q.canvas, 0, 0, big.width, big.height);
  const w = await ocrWorker();
  const { data } = await w.recognize(big);
  const parsed = parseCnicText(data.text);
  const typed = typedCnic && /^\d{5}-\d{7}-\d$/.test(typedCnic) ? typedCnic : null;
  return { quality, text: data.text, confidence: Math.round(data.confidence), ...parsed, matchesTyped: parsed.cnic && typed ? parsed.cnic === typed : null, ms: Math.round(performance.now() - t0) };
}
