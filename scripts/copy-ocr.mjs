// Self-hosts the OCR engine (Tesseract LSTM, WebAssembly) and its English model under /ocr, so CNIC reading
// works without any third-party CDN or API key.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
const out = new URL("../public/ocr/", import.meta.url);
mkdirSync(out, { recursive: true });
const core = new URL("../node_modules/tesseract.js-core/", import.meta.url);
for (const f of readdirSync(core)) if (/^tesseract-core.*lstm\.wasm\.js$/.test(f)) cpSync(new URL(f, core), new URL(f, out));
cpSync(new URL("../node_modules/tesseract.js/dist/worker.min.js", import.meta.url), new URL("worker.min.js", out));
cpSync(new URL("../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", import.meta.url), new URL("eng.traineddata.gz", out));
console.log("OCR assets copied to public/ocr");
