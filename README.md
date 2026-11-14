# Blood Bridge — Web App

A web version of **Blood Bridge**, a blood-donation platform for Karachi that connects people who need blood with verified donors nearby. It's built from the React Native/Firebase mobile app I worked on as a team contributor ([mobile app + BloodBot](https://github.com/hfsachndio/blood-bridge-app)), and it adds an **NLP assistant (BloodBot)** that the mobile app doesn't have.

**Live demo:** https://blood-bridge-opal.vercel.app

| Demo account | Email | Password |
|---|---|---|
| Donor | `ahmed@bloodbridge.demo` | `Demo#1234` |
| Admin | `admin@bloodbridge.demo` | `Admin#1234` |

You can also sign up as a new user. The demo approves your CNIC automatically after a few seconds, which mimics the admin review.

## Features

- **Auth and verification:** sign up, log in, password reset, and a profile builder (date of birth, weight, area, blood type, CNIC with auto-formatting, CNIC photo). After that the account goes to pending review, then admin approval.
- **SOS requests:** send an urgent request for a hospital. Compatible, available donors within 15 km are notified. Donors can respond, and the requester can close the request.
- **Search:** an OpenStreetMap map with filters for blood type (compatibility-aware), radius and area. It covers donors, donation offers and the nearest blood banks.
- **Chat:** one-to-one messaging with unread badges.
- **Donate:** post an offer and pick its location on the map.
- **Leaderboard and awards:** 100 points per offer and 150 per logged donation, plus milestone badges.
- **Donation history:** log a donation and get a printable certificate.
- **Eligibility check:** the same rules as the mobile app (age, weight, 90-day gap, tattoo, illness and so on).
- **Admin dashboard:** review CNIC submissions, then approve or reject them.
- **Responsive design:** a sidebar on desktop, bottom tabs on mobile.

## NLP: BloodBot (new in the web version)

BloodBot understands **English and Roman Urdu** (for example "meri ammi ko 2 bottle AB- chahiye indus mein, critical"). It runs entirely in the browser, with no API key and no data leaving the device.

| Stage | What it does | File |
|---|---|---|
| Normalisation | Maps Roman Urdu to English (khoon → blood, chahiye → need), lowercases, removes stop-words, applies a light stemmer | `src/lib/nlp/text.ts` |
| Intent classification | TF-IDF over unigrams and bigrams, cosine k-NN against 250+ labelled phrases (29 intents), with a confidence threshold and an out-of-domain fallback | `src/lib/nlp/classifier.ts` |
| Named-entity recognition | Blood types in any spelling, typo-tolerant Karachi areas and hospitals (Levenshtein), units (including Urdu numbers), age, weight, days since, urgency | `src/lib/nlp/entities.ts` |
| Dialogue manager | Slot filling for multi-turn tasks (SOS: blood type → hospital → units → urgency → confirm), follow-ups, and actions on real app data | `src/lib/nlp/bot.ts` |

Held-out intent accuracy is **96.6%**; see `src/lib/nlp/__tests__`. Switch on "Show NLP details" on the BloodBot page to see each message's intent, confidence and entities.

## Tech

Vite, React 18, TypeScript (strict), Tailwind CSS, React Router, React-Leaflet (OpenStreetMap), lucide-react and Vitest. In this demo, a localStorage store stands in for the mobile app's Firestore collections (`users`, `requests`, `donations`, `donationRecords`, `chats`, `notifications`).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # NLP + dialogue tests
npm run build
```

## Credits

The original **Blood Bridge** mobile app (React Native + Firebase) was built as a team project; I was one of the contributors. This web app is my own adaptation of that project's flows, data model and eligibility rules, and the NLP assistant is my addition.
