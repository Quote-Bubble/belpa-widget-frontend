import type { PropertyType, SolarScan, StoreyBand } from "@/lib/types";

export type AccessAssessment = {
  estimatedStoreys: StoreyBand;
  steepPitch: boolean;
  complexity: "simple" | "moderate" | "complex";
  scaffoldWeeks: number;
  /** Repair only: reachable from a tower, so no scaffold week is warranted. */
  towerAccess: boolean;
  accessMultiplier: number;
  extraConfidence: number;
  notes: string[];
};

/**
 * Above this many m², a repair stops being a patch and needs a real working
 * platform. Below it a roofer works from a tower or a roof ladder, which is
 * both what actually happens on site and a fraction of the cost.
 */
export const REPAIR_SCAFFOLD_AREA_M2 = 10;

function clampStoreys(value: number): StoreyBand {
  if (value <= 1) return 1;
  if (value >= 4) return 4;
  if (value >= 3) return 3;
  return 2;
}

/**
 * Scaffold cost scales mainly with how many elevations need wrapping, not
 * with how "detached" a property feels. A standalone house is exposed on
 * all four sides; terraced houses share party walls with both neighbours
 * and typically only need scaffolding on two. Semi-detached sits between
 * (one shared wall); flats often mean complex or communal access.
 * Cross-checked against published scaffold-cost ranges: a typical semi
 * runs £900–£1,800, a detached (or anything needing a full wrap) £1,500–
 * £3,500, detached trends higher despite easier site access, because the
 * extra elevations outweigh it (MyBuilder / MyJobQuote 2026 scaffolding
 * cost guides).
 */
function attachmentMultiplier(propertyType: PropertyType | null): {
  multiplier: number;
  note: string | null;
} {
  switch (propertyType) {
    case "detached":
    case "bungalow":
      return {
        multiplier: 1.15,
        note: "Standalone properties need scaffolding on all four elevations, modelled with a 15% uplift.",
      };
    case "flat":
      return {
        multiplier: 1.2,
        note: "Flats often mean complex or communal access, modelled with a 20% uplift.",
      };
    case "semi_detached":
    case "end_of_terrace":
      return {
        multiplier: 1.05,
        note: "This property needs scaffolding on three elevations, modelled with a 5% uplift.",
      };
    case "terraced":
      return {
        multiplier: 0.9,
        note: "Terraced only needs scaffolding on two elevations (party walls both sides), modelled with a 10% reduction.",
      };
    default:
      return { multiplier: 1, note: null };
  }
}

/**
 * Steep-pitch labour surcharge, tiered rather than a single flat bump.
 * Trade guidance: surcharges typically start around a 30° pitch, and
 * 40°+ roofs commonly see materially higher labour (fall-arrest gear,
 * slower going), published ranges run from roughly 20% up past 50% for
 * the steepest roofs (Bill Ragan Roofing / 1build pitch-cost guides).
 * These tiers sit inside that range rather than at either edge.
 */
function pitchMultiplier(avgPitchDegrees: number): {
  multiplier: number;
  confidence: number;
  note: string | null;
} {
  if (avgPitchDegrees >= 50) {
    return {
      multiplier: 1.55,
      confidence: 0.1,
      note: `Average pitch ≈ ${avgPitchDegrees.toFixed(0)}°, very steep roofs add a 55% access/labour uplift.`,
    };
  }
  if (avgPitchDegrees >= 40) {
    return {
      multiplier: 1.35,
      confidence: 0.07,
      note: `Average pitch ≈ ${avgPitchDegrees.toFixed(0)}°, steep roofs add a 35% access/labour uplift.`,
    };
  }
  if (avgPitchDegrees >= 30) {
    return {
      multiplier: 1.15,
      confidence: 0.04,
      note: `Average pitch ≈ ${avgPitchDegrees.toFixed(0)}°, steep roofs add a 15% access/labour uplift.`,
    };
  }
  return { multiplier: 1, confidence: 0, note: null };
}

/**
 * Modest price uplift for many-planed (hip-like) roofs, on top of the
 * existing confidence widening. Published complexity premiums vary widely
 * (10%–40%+) and are mostly US-market figures conflated with the extra
 * surface area a hip roof has anyway, which this model already prices
 * correctly via measured area. This uplift is deliberately conservative:
 * it accounts for the added labour of extra hips/valleys/cutting, not a
 * second helping of the area effect.
 */
function complexityMultiplier(complexity: AccessAssessment["complexity"]): number {
  if (complexity === "complex") return 1.08;
  if (complexity === "moderate") return 1.03;
  return 1;
}

/**
 * Derive scaffolding weeks, access uplift, and confidence wideners from the
 * Solar scan (pitch / plane count) plus the homeowner's storey / property answers.
 * Storey count comes from the answer alone, satellite height is not used.
 */
export function assessAccess(
  scan: SolarScan | null,
  storeysAnswer: StoreyBand | null,
  propertyType: PropertyType | null,
  path:
    | "measured"
    | "repair"
    | "roofline"
    | "flat"
    | "consultation" = "measured",
  /** Repair path only: the representative area of the band the customer chose. */
  repairAreaM2?: number,
): AccessAssessment {
  const notes: string[] = [];
  let extraConfidence = 0;

  const estimatedStoreys = clampStoreys(storeysAnswer ?? 2);

  const avgPitch =
    scan && scan.roofSegmentStats.length > 0
      ? scan.roofSegmentStats.reduce(
          (sum, segment) => sum + segment.pitchDegrees,
          0,
        ) / scan.roofSegmentStats.length
      : 0;
  const pitch = pitchMultiplier(avgPitch);
  const steepPitch = pitch.multiplier > 1;
  let accessMultiplier = pitch.multiplier;
  extraConfidence += pitch.confidence;
  if (pitch.note) notes.push(pitch.note);

  const segmentCount = scan?.roofSegmentStats.length ?? 0;
  let complexity: AccessAssessment["complexity"] = "simple";
  if (segmentCount >= 6) {
    complexity = "complex";
    extraConfidence += 0.05;
    notes.push(
      `${segmentCount} roof planes detected, complex roofs add an 8% labour uplift and widen the confidence band.`,
    );
  } else if (segmentCount >= 3) {
    complexity = "moderate";
    extraConfidence += 0.02;
  }
  accessMultiplier *= complexityMultiplier(complexity);

  const attachment = attachmentMultiplier(propertyType);
  accessMultiplier *= attachment.multiplier;
  if (attachment.note) notes.push(attachment.note);

  let scaffoldWeeks = 0;
  let towerAccess = false;
  if (path === "repair") {
    /* A repair is not a re-roof, and it was being priced as though the only
       question were height.
     *
     * The old rule was `storeys >= 2 ? 1 week : 0`, which put a £625 scaffold
     * week on a job whose labour is a few hundred pounds, and nothing at all
     * on the identical repair one storey lower. Two customers with the same
     * few slipped tiles saw wildly different prices, which is what makes the
     * estimate look arbitrary.
     *
     * What decides it on site is how much roof the work spans, not just how
     * far up it is. A patch is reached from a tower or a roof ladder; an area
     * big enough to walk about on needs a platform, and so does anything
     * three storeys up where a tower will not safely reach. */
    const area = repairAreaM2 ?? 0;
    if (estimatedStoreys >= 3 || area > REPAIR_SCAFFOLD_AREA_M2) {
      scaffoldWeeks = 1;
      notes.push(
        estimatedStoreys >= 3
          ? "Priced with a scaffold week: at three storeys and up, a tower will not reach the work safely."
          : "Priced with a scaffold week: a repair over this area needs a working platform rather than a tower.",
      );
    } else if (estimatedStoreys >= 2) {
      towerAccess = true;
      notes.push(
        "Priced for tower access rather than a full scaffold, which is how a patch at this height is normally reached.",
      );
    }
    // Single storey falls through to no access line at all: that is ladder
    // work, and the repair rate already covers it.
  } else if (path === "consultation") {
    scaffoldWeeks = 0;
  } else {
    scaffoldWeeks = estimatedStoreys >= 4 ? 3 : estimatedStoreys >= 3 ? 2 : 1;
  }

  return {
    estimatedStoreys,
    steepPitch,
    complexity,
    scaffoldWeeks,
    towerAccess,
    accessMultiplier,
    extraConfidence,
    notes,
  };
}
