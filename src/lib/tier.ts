import { AGENT_TIER, type AgentTier } from "./enums";

/**
 * Which tier an agency is priced at.
 *
 * Two rules:
 *
 *  1. `derivedTier` is a GUESS, parsed from the address the agency typed at
 *     registration. It is best-effort and expected to be wrong sometimes.
 *  2. `tierOverride` is Sonet's decision. Whenever it is set it wins, full
 *     stop. Nothing re-derives over the top of it, and no later edit to the
 *     address changes it.
 *
 * Everything that prices anything must go through `effectiveTier`. Reading
 * either column directly is how the override silently stops mattering.
 */

export function effectiveTier(agent: {
  derivedTier: string;
  tierOverride: string | null;
}): AgentTier {
  const chosen = agent.tierOverride ?? agent.derivedTier;
  return (AGENT_TIER as readonly string[]).includes(chosen)
    ? (chosen as AgentTier)
    : "OUTSIDE_KERALA"; // Unrecognised value: charge the higher, safer tier.
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Kerala's 14 districts plus the town and colonial names that turn up in real
 * addresses. Deliberately generous — a wrong guess is cheap here because Sonet
 * reviews every registration before it can quote anything, and he can override.
 */
const KERALA_PLACES = [
  // Districts
  "kerala", "thiruvananthapuram", "kollam", "pathanamthitta", "alappuzha",
  "kottayam", "idukki", "ernakulam", "thrissur", "palakkad", "malappuram",
  "kozhikode", "wayanad", "kannur", "kasaragod", "kasargod",
  // Older / anglicised names still in daily use
  "trivandrum", "quilon", "alleppey", "cochin", "kochi", "calicut", "trichur",
  "palghat", "cannanore", "tellicherry", "trichoor",
  // Towns and tourist centres that appear without a district
  "munnar", "thekkady", "kumily", "kumarakom", "varkala", "kovalam",
  "guruvayur", "guruvayoor", "cherai", "vagamon", "bekal", "nedumbassery",
  "aluva", "alwaye", "angamaly", "perumbavoor", "muvattupuzha", "thodupuzha",
  "changanassery", "thiruvalla", "chengannur", "kayamkulam", "cherthala",
  "vaikom", "pala", "ponnani", "tirur", "manjeri", "vadakara", "thalassery",
  "payyannur", "kanhangad", "kalpetta", "sultan bathery", "mananthavady",
  "attingal", "neyyattinkara", "nedumangad", "punalur", "adoor", "ranni",
  "marine drive", "fort kochi", "willingdon island", "kakkanad", "edappally",
  "athirappilly", "wayanad", "poovar", "kanjirappally", "erattupetta",
] as const;

/**
 * Kerala PIN codes run 670001–695615, i.e. everything starting 67, 68 or 69.
 * This is the single strongest signal in an Indian address, so it is checked
 * before the name list — a PIN is structured, whereas a place name can be a
 * street, a building, or a company name anywhere in the country.
 */
const KERALA_PIN = /\b6[789]\d{4}\b/;

export type TierDerivation = {
  tier: AgentTier;
  /** Why, in words — shown to Sonet next to the override control. */
  reason: string;
};

export function deriveTier(address: string): TierDerivation {
  const text = address.toLowerCase();

  const pin = text.match(KERALA_PIN);
  if (pin) {
    return { tier: "KERALA", reason: `PIN code ${pin[0]} is in Kerala` };
  }

  // A six-digit PIN that is NOT Kerala's is just as conclusive the other way.
  const otherPin = text.match(/\b\d{6}\b/);
  if (otherPin) {
    return {
      tier: "OUTSIDE_KERALA",
      reason: `PIN code ${otherPin[0]} is outside Kerala`,
    };
  }

  for (const place of KERALA_PLACES) {
    // Word-boundary match, so "Kollam" does not fire on "Kollamkode Traders"
    // in some other state — and more importantly so short names do not match
    // inside unrelated words.
    const pattern = new RegExp(`\\b${place.replace(/\s+/g, "\\s+")}\\b`);
    if (pattern.test(text)) {
      return { tier: "KERALA", reason: `address mentions ${place}` };
    }
  }

  return {
    tier: "OUTSIDE_KERALA",
    reason: "no Kerala PIN code or place name found in the address",
  };
}
