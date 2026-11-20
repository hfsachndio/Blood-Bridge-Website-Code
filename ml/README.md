# Blood Bridge ML: donor-response model

| Step | Command | Output |
|---|---|---|
| 1. Build the dataset | `python generate_donors.py` | `data/notifications.jsonl`: 30,000 SOS alerts, one row per donor alerted, with whether they responded within an hour |
| 2. Train + evaluate | `python train_donor_model.py` | `../src/lib/ai/donor-model.json` (weights), `reports/donor-model.md`, `reports/donor-parity.json` |
| 3. Test | `npm test` (repo root) | the TypeScript forward pass reproduces scikit-learn to 1e-5 |

## Model card

- **Purpose:** when someone sends an SOS, alert the donors most likely to actually come first, and show requesters who is likely to respond. Search can also sort donors by this score.
- **Data:** synthetic alert log with realistic, non-linear behaviour: willingness drops sharply beyond ~7 km, far donors rarely respond at night, donors who gave blood in the last 90 days mostly can't, engaged donors (past responses, donations) respond more, urgent requests and an exact type match help, and brand-new accounts respond less.
- **Features (10):** distance, days since last donation, eligible now (90-day rule), exact type match, total donations, past SOS responses, hour of day (sin/cos encoded), urgent, account age.
- **Model:** a feed-forward neural network: 10 → 24 → 12 → 1, ReLU, sigmoid output, StandardScaler inputs, Adam with L2 α = 0.003 (`MLPClassifier`). Compared against logistic regression, gradient boosting and the old nearest-first ordering.
- **Ranking quality:** NDCG@3 over groups of 12 candidate donors per request.
- **Serving:** weights exported to JSON (8 KB) and run in the browser in TypeScript (`src/lib/ai/donorRank.ts`). No server, GPU or paid API.

## Other AI in Blood Bridge

- **BloodBot (NLP):** TF-IDF intent classifier and entity extraction for English and Roman Urdu (`src/lib/nlp`), 96.6% held-out intent accuracy.
- **CNIC reader (computer vision):** `src/lib/ai/cnicVision.ts` checks photo quality (brightness, contrast, sharpness via variance of the Laplacian), preprocesses the image (grayscale, contrast stretch, 2× upscale) and reads it with Tesseract's LSTM OCR model running in WebAssembly. The engine and the English model are self-hosted under `/ocr` (copied from npm at build time by `scripts/copy-ocr.mjs`). It extracts the CNIC number, date of birth and name, compares the number with what the user typed, and shows the result to the admin who verifies the account.

## Results
30,000 synthetic SOS notifications (37.2% responded) · 75/25 split · features: distance_km, days_since_donation, eligible_now, exact_type, total_donations, past_responses, hour_sin, hour_cos, urgent, account_age_days

| Model | ROC-AUC | PR-AUC | Log loss | Brier | NDCG@3 (ranking 12 donors per request) |
|---|---|---|---|---|---|
| mlp_24_12 | 0.8416 | 0.7428 | 0.4735 | 0.1534 | 0.7829 |
| logistic_regression | 0.837 | 0.7379 | 0.479 | 0.1554 | 0.7797 |
| gradient_boosting | 0.8455 | 0.7483 | 0.4668 | 0.151 | 0.7933 |
| nearest_first_baseline | 0.7795 | – | – | – | 0.6766 |

**Shipped:** `mlp_24_12` — a 10→24→12→1 ReLU network (StandardScaler inputs, L2 α = 0.003, Adam). It runs in the browser in under a millisecond per donor.

`nearest_first_baseline` is the old behaviour (closest donor first).
