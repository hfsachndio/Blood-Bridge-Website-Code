# Donor-response model – evaluation

30,000 synthetic SOS notifications (37.2% responded) · 75/25 split · features: distance_km, days_since_donation, eligible_now, exact_type, total_donations, past_responses, hour_sin, hour_cos, urgent, account_age_days

| Model | ROC-AUC | PR-AUC | Log loss | Brier | NDCG@3 (ranking 12 donors per request) |
|---|---|---|---|---|---|
| mlp_24_12 | 0.8416 | 0.7428 | 0.4735 | 0.1534 | 0.7829 |
| logistic_regression | 0.837 | 0.7379 | 0.479 | 0.1554 | 0.7797 |
| gradient_boosting | 0.8455 | 0.7483 | 0.4668 | 0.151 | 0.7933 |
| nearest_first_baseline | 0.7795 | – | – | – | 0.6766 |

**Shipped:** `mlp_24_12` — a 10→24→12→1 ReLU network (StandardScaler inputs, L2 α = 0.003, Adam). It runs in the browser in under a millisecond per donor.

`nearest_first_baseline` is the old behaviour (closest donor first).
