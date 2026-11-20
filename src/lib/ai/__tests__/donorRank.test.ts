import { describe, expect, it } from "vitest";
import parity from "../../../../ml/reports/donor-parity.json";
import { responseProbability, type DonorInput } from "../donorRank";

describe("donor-response neural network", () => {
  it("reproduces scikit-learn's predictions", () => {
    for (const s of parity as { donor: DonorInput; p: number }[]) expect(Math.abs(responseProbability(s.donor) - s.p)).toBeLessThan(1e-5);
  });
  it("prefers a near, eligible, engaged donor over a far one who just donated", () => {
    const base: DonorInput = { distanceKm: 2, daysSinceDonation: 200, exactType: true, totalDonations: 4, pastResponses: 3, hour: 15, urgent: true, accountAgeDays: 300 };
    const worse: DonorInput = { ...base, distanceKm: 13, daysSinceDonation: 20, pastResponses: 0, hour: 2 };
    expect(responseProbability(base)).toBeGreaterThan(0.7);
    expect(responseProbability(worse)).toBeLessThan(0.15);
  });
});
