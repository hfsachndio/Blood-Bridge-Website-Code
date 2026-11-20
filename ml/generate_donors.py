"""Synthetic SOS notification log: one row per (donor notified, request) with whether the donor responded within an hour.

Response behaviour is deliberately non-linear, as it is in practice: willingness drops sharply past ~6-8 km,
far donors are much less likely to respond at night, donors who gave blood in the last 90 days mostly
can't, engaged donors (past responses, donations) respond more, and urgent requests lift everyone a little.
"""
import json, math, random, sys
random.seed(11)

def sample():
    km = random.uniform(0.3, 15)
    days = None if random.random() < 0.3 else random.randint(5, 400)
    hour = random.choices(range(24), [1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 4, 3, 2])[0]
    d = {"distanceKm": round(km, 2), "daysSinceDonation": days, "exactType": random.random() < 0.45, "totalDonations": min(20, int(random.expovariate(0.35))),
         "pastResponses": min(10, int(random.expovariate(0.6))), "hour": hour, "urgent": random.random() < 0.4, "accountAgeDays": random.randint(1, 730)}
    night = hour < 7 or hour >= 22
    z = 1.2 - 3.2 / (1 + math.exp(-(km - 7) / 1.3))            # sharp drop beyond ~7 km
    z -= (1.4 if night else 0) * (km / 15) ** 1.5 + (0.5 if night else 0)
    if days is not None and days < 90: z -= 2.6                 # recently donated: usually not allowed yet
    z += 0.35 * math.log1p(d["pastResponses"]) * 1.6 + 0.08 * min(d["totalDonations"], 8)
    z += 0.55 if d["urgent"] else 0
    z += 0.25 if d["exactType"] else 0
    z += -0.6 if d["accountAgeDays"] < 14 else 0                # brand-new accounts respond less
    p = 1 / (1 + math.exp(-(z - 0.6)))
    d["responded"] = int(random.random() < p)
    return d

def main(n=30000, out="data/notifications.jsonl"):
    import os; os.makedirs("data", exist_ok=True)
    rows = [sample() for _ in range(int(n))]
    with open(out, "w") as f:
        for r in rows: f.write(json.dumps(r) + "\n")
    print(len(rows), "notifications,", round(sum(r["responded"] for r in rows) / len(rows), 3), "response rate")

if __name__ == "__main__": main(*sys.argv[1:])
