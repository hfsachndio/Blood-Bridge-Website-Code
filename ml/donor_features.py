"""Donor × SOS request → features. src/lib/ai/donorRank.ts computes exactly the same values."""
import math
FEATURES = ["distance_km", "days_since_donation", "eligible_now", "exact_type", "total_donations", "past_responses", "hour_sin", "hour_cos", "urgent", "account_age_days"]

def features(d):
    days = d.get("daysSinceDonation")
    days = 365.0 if days is None else float(min(365, max(0, days)))
    h = float(d.get("hour", 12)) % 24
    return [
        float(min(15.0, max(0.0, d["distanceKm"]))),
        days,
        1.0 if days >= 90 else 0.0,
        1.0 if d.get("exactType") else 0.0,
        float(min(20, d.get("totalDonations", 0))),
        float(min(10, d.get("pastResponses", 0))),
        math.sin(2 * math.pi * h / 24),
        math.cos(2 * math.pi * h / 24),
        1.0 if d.get("urgent") else 0.0,
        float(min(730, d.get("accountAgeDays", 0))),
    ]
