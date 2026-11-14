// Ported unchanged from the Blood Bridge mobile app (src/utils/eligibility.ts) so web and mobile give identical answers.
/**
 * Smart Donation Eligibility Engine
 * Based on WHO and Pakistan blood donation guidelines.
 */

export type EligibilityOutcome =
    | 'eligible'        // Can donate now
    | 'wait'            // Must wait X days
    | 'medical_review'  // Needs doctor clearance
    | 'not_eligible';   // Permanently or long-term ineligible

export interface EligibilityResult {
    outcome: EligibilityOutcome;
    title: string;
    message: string;
    daysUntilEligible?: number; // only for 'wait'
    nextEligibleDate?: string;  // only for 'wait'
    reasons: string[];
}

export interface EligibilityInput {
    dateOfBirth: string;        // "MM/DD/YYYY" or "YYYY-MM-DD"
    weight: number;             // kg
    lastDonationDate?: string;  // ISO string or empty
    // Health questionnaire answers
    hasFever: boolean;
    hasIllness: boolean;
    hadSurgeryRecently: boolean;       // within 6 months
    isOnMedication: boolean;
    hadTattooOrPiercing: boolean;      // within 6 months
    isPregnantOrBreastfeeding: boolean;
    hadBloodTransfusion: boolean;      // within 12 months
}

const MIN_AGE = 18;
const MAX_AGE = 65;
const MIN_WEIGHT_KG = 50;
const MIN_DAYS_BETWEEN_DONATIONS = 90; // 3 months (whole blood)

const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    // Try MM/DD/YYYY
    const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) {
        return new Date(
            parseInt(mmddyyyy[3]),
            parseInt(mmddyyyy[1]) - 1,
            parseInt(mmddyyyy[2])
        );
    }
    // Try YYYY-MM-DD or ISO
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
};

const getAge = (dob: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
};

const formatDate = (d: Date): string =>
    d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });

export const checkEligibility = (input: EligibilityInput): EligibilityResult => {
    const reasons: string[] = [];

    // ── Age check ─────────────────────────────────────────────────────────────
    const dob = parseDate(input.dateOfBirth);
    const age = dob ? getAge(dob) : null;

    if (!dob || age === null) {
        return {
            outcome: 'not_eligible',
            title: 'Date of Birth Missing',
            message: 'Please update your date of birth in your profile to check eligibility.',
            reasons: ['Date of birth not set'],
        };
    }

    if (age < MIN_AGE) {
        return {
            outcome: 'not_eligible',
            title: 'Not Eligible Yet',
            message: `You must be at least ${MIN_AGE} years old to donate blood. You are ${age} years old.`,
            reasons: [`Age ${age} is below minimum age of ${MIN_AGE}`],
        };
    }

    if (age > MAX_AGE) {
        return {
            outcome: 'medical_review',
            title: 'Needs Medical Review',
            message: `Donors above ${MAX_AGE} years require a doctor's clearance before donating.`,
            reasons: [`Age ${age} exceeds standard limit of ${MAX_AGE}`],
        };
    }

    // ── Weight check ──────────────────────────────────────────────────────────
    if (!input.weight || input.weight < MIN_WEIGHT_KG) {
        return {
            outcome: 'not_eligible',
            title: 'Below Minimum Weight',
            message: `You must weigh at least ${MIN_WEIGHT_KG} kg to donate. Your weight: ${input.weight || 0} kg.`,
            reasons: [`Weight ${input.weight || 0} kg is below minimum ${MIN_WEIGHT_KG} kg`],
        };
    }

    // ── Immediate disqualifiers (medical review) ──────────────────────────────
    if (input.isPregnantOrBreastfeeding) {
        return {
            outcome: 'not_eligible',
            title: 'Not Eligible',
            message: 'You cannot donate blood while pregnant or breastfeeding.',
            reasons: ['Pregnant or breastfeeding'],
        };
    }

    if (input.hasFever || input.hasIllness) {
        return {
            outcome: 'medical_review',
            title: 'Needs Medical Review',
            message: 'You have reported fever or active illness. Please consult a doctor before donating.',
            reasons: [
                input.hasFever ? 'Currently has fever' : '',
                input.hasIllness ? 'Currently ill' : '',
            ].filter(Boolean),
        };
    }

    if (input.isOnMedication) {
        reasons.push('Currently on medication — doctor clearance recommended');
        return {
            outcome: 'medical_review',
            title: 'Needs Medical Review',
            message: 'Some medications affect blood donation eligibility. Please consult your doctor.',
            reasons,
        };
    }

    // ── Temporary deferrals (wait period) ─────────────────────────────────────
    const today = new Date();

    if (input.hadSurgeryRecently) {
        const waitUntil = new Date(today);
        waitUntil.setMonth(waitUntil.getMonth() + 6);
        return {
            outcome: 'wait',
            title: 'Wait Required',
            message: 'You must wait 6 months after surgery before donating.',
            daysUntilEligible: 180,
            nextEligibleDate: formatDate(waitUntil),
            reasons: ['Recent surgery within 6 months'],
        };
    }

    if (input.hadTattooOrPiercing) {
        const waitUntil = new Date(today);
        waitUntil.setMonth(waitUntil.getMonth() + 6);
        return {
            outcome: 'wait',
            title: 'Wait Required',
            message: 'You must wait 6 months after a tattoo or piercing before donating.',
            daysUntilEligible: 180,
            nextEligibleDate: formatDate(waitUntil),
            reasons: ['Recent tattoo or piercing within 6 months'],
        };
    }

    if (input.hadBloodTransfusion) {
        const waitUntil = new Date(today);
        waitUntil.setFullYear(waitUntil.getFullYear() + 1);
        return {
            outcome: 'wait',
            title: 'Wait Required',
            message: 'You must wait 12 months after receiving a blood transfusion.',
            daysUntilEligible: 365,
            nextEligibleDate: formatDate(waitUntil),
            reasons: ['Received blood transfusion within 12 months'],
        };
    }

    // ── Last donation date check ───────────────────────────────────────────────
    if (input.lastDonationDate) {
        const lastDonation = parseDate(input.lastDonationDate);
        if (lastDonation) {
            const daysSince = Math.floor(
                (today.getTime() - lastDonation.getTime()) / (1000 * 60 * 60 * 24)
            );
            const daysLeft = MIN_DAYS_BETWEEN_DONATIONS - daysSince;

            if (daysLeft > 0) {
                const nextDate = new Date(lastDonation);
                nextDate.setDate(nextDate.getDate() + MIN_DAYS_BETWEEN_DONATIONS);
                return {
                    outcome: 'wait',
                    title: `Wait ${daysLeft} More Days`,
                    message: `Your last donation was ${daysSince} days ago. You need to wait at least ${MIN_DAYS_BETWEEN_DONATIONS} days between donations.`,
                    daysUntilEligible: daysLeft,
                    nextEligibleDate: formatDate(nextDate),
                    reasons: [`Only ${daysSince} days since last donation (minimum ${MIN_DAYS_BETWEEN_DONATIONS})`],
                };
            }
        }
    }

    // ── All checks passed ─────────────────────────────────────────────────────
    return {
        outcome: 'eligible',
        title: 'Eligible to Donate! 🩸',
        message: 'You meet all the criteria to donate blood. Thank you for being a lifesaver!',
        reasons: [],
    };
};

export const RULES = { MIN_AGE, MAX_AGE, MIN_WEIGHT_KG, MIN_DAYS_BETWEEN_DONATIONS };

/** Days until the donor can give again after a donation on `last` (0 = can donate now). */
export function daysUntilNextDonation(last?: string): number {
    const d = last ? parseDate(last) : null;
    if (!d) return 0;
    const since = Math.floor((Date.now() - d.getTime()) / 86400000);
    return Math.max(0, MIN_DAYS_BETWEEN_DONATIONS - since);
}
