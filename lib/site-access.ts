/**
 * Turning what we can SEE around a property into what it costs.
 *
 * A scaffolder prices two different things and the existing access model only
 * knows one of them. `assessAccess` asks "how many elevations need wrapping",
 * inferred from property type — a real driver, but it says nothing about
 * whether the scaffold can physically get there. Cost guides are unanimous that
 * the second one moves the number: narrow streets, no parking, a lorry that
 * cannot get close, and pavement licences all add labour and fees.
 *
 * ── The rule this module exists to enforce ────────────────────────────────
 * The vision model PERCEIVES. This code PRICES.
 *
 * Gemini returns observations only — never a multiplier, never a figure. A
 * model-generated price is unauditable, drifts silently when Google updates the
 * model, and cannot be defended to a roofer who disagrees with it. Observations
 * are checkable ("is there a double yellow line outside this house"), and every
 * number below is a published rate anybody can look up.
 *
 * ── Confident vs unsure ───────────────────────────────────────────────────
 * A confident observation becomes an explicit cost the roofer can argue with.
 * An unsure one widens the confidence band instead. The estimate never fakes
 * precision it does not have, and never silently fudges the midpoint.
 *
 * Sources for every figure here: Checkatrade, MyBuilder and MyJobQuote 2026
 * scaffolding cost guides. Permits £120–£180/month (~£140 typical). Access,
 * permit and restriction factors together add 15–30% to base scaffold cost.
 */

/** Everything the vision model is allowed to tell us. Observations, not prices. */
export type SiteObservation = {
  /** Drives the pavement-licence line. The single highest-value field. */
  frontage: "on_pavement" | "small_setback" | "driveway_setback" | "unclear";
  /** Can a scaffold lorry stop next to the property? */
  vehicleAccess: "adjacent" | "nearby" | "restricted" | "unclear";
  parkingRestriction:
    | "none_visible"
    | "single_yellow"
    | "double_yellow"
    | "permit_zone"
    | "unclear";
  /** Can scaffold reach the rear without going through the house? */
  sideAccess: "clear" | "narrow" | "none_visible" | "unclear";
  obstructions: Array<
    | "mature_trees"
    | "conservatory"
    | "power_lines"
    | "steep_ground"
    | "outbuilding"
  >;
  /** Was the imagery usable at all? Rural coverage is patchy. */
  imageryUsable: boolean;
  /** Street View can be years old — an extension may simply not be there yet. */
  imageryYear: number | null;
  /** Per-field 0–1. Anything under CONFIDENT is treated as a shrug. */
  confidence: Partial<Record<keyof SiteObservation, number>>;
};

export type SiteAccessEffect = {
  /** Named costs to add to the breakdown, each defensible on its own. */
  lineItems: Array<{ label: string; min: number; max: number }>;
  /** Multiplier on scaffold labour, from the published access premium. */
  labourMultiplier: number;
  /** Added to the confidence band where we are guessing. */
  extraConfidence: number;
  /** Plain-English reasons, for the model-assumptions footnote. */
  notes: string[];
};

/**
 * Below this, an observation only widens the band — it never moves the price.
 *
 * 0.7 rather than something higher because the alternative to acting is not
 * "no error", it is "certainly wrong": ignoring a pavement licence on a terrace
 * that plainly needs one is its own inaccuracy. The asymmetry that matters is
 * that a wrong ADDED cost is visible and arguable, while a wrong omission is
 * silent, so the bar sits above a coin-flip but not at certainty.
 */
const CONFIDENT = 0.7;

/** Published permit range, per month. Roofs rarely need more than one month. */
const PERMIT_MIN = 120;
const PERMIT_MAX = 180;

function sure(o: SiteObservation, field: keyof SiteObservation): boolean {
  return (o.confidence[field] ?? 0) >= CONFIDENT;
}

/**
 * No observation at all. Used when imagery is missing, the model failed, or the
 * feature is switched off — every caller gets a valid, neutral effect rather
 * than having to null-check.
 */
export function noSiteEffect(): SiteAccessEffect {
  return { lineItems: [], labourMultiplier: 1, extraConfidence: 0, notes: [] };
}

export function siteAccessEffect(
  observation: SiteObservation | null,
): SiteAccessEffect {
  if (!observation || !observation.imageryUsable) {
    // Deliberately NOT a neutral silence: we looked and could not see. Say so by
    // widening slightly, rather than quoting as though the site were known-easy.
    return {
      lineItems: [],
      labourMultiplier: 1,
      extraConfidence: observation ? 0.02 : 0,
      notes: observation
        ? [
            "No usable street imagery for this address, so site access is unconfirmed.",
          ]
        : [],
    };
  }

  const effect = noSiteEffect();
  const o = observation;

  // ── Pavement licence ────────────────────────────────────────────────────
  // The most valuable output, because it is close to binary and has a published
  // price. A terrace fronting the footway needs a licence; a house behind its
  // own drive does not.
  if (o.frontage === "on_pavement") {
    if (sure(o, "frontage")) {
      effect.lineItems.push({
        label: "Pavement licence (estimated)",
        min: PERMIT_MIN,
        max: PERMIT_MAX,
      });
      effect.notes.push(
        "Scaffold looks likely to stand on the footway, which needs a council licence (£120–£180/month).",
      );
    } else {
      effect.extraConfidence += 0.03;
    }
  }

  // ── Getting the scaffold to the building ────────────────────────────────
  // Uplifts stay at the LOW end of the published 15–30% band. That band covers
  // permits, out-of-hours working and extended hire as well as access, and
  // permits are already priced above — taking the top of the range here would
  // charge for the same thing twice.
  if (o.vehicleAccess === "restricted" && sure(o, "vehicleAccess")) {
    effect.labourMultiplier *= 1.12;
    effect.notes.push(
      "A scaffold lorry cannot get close, so materials are carried in — modelled with a 12% labour uplift.",
    );
  } else if (o.vehicleAccess === "restricted") {
    effect.extraConfidence += 0.03;
  }

  if (
    (o.parkingRestriction === "double_yellow" ||
      o.parkingRestriction === "permit_zone") &&
    sure(o, "parkingRestriction")
  ) {
    effect.labourMultiplier *= 1.08;
    effect.notes.push(
      "Parking is restricted outside the property, which usually means a bay suspension or permit.",
    );
  }

  // Rear access is the expensive one: with no side route, scaffold goes through
  // the house, which is slow, careful work and sometimes refused outright.
  if (o.sideAccess === "none_visible" && sure(o, "sideAccess")) {
    effect.labourMultiplier *= 1.15;
    effect.notes.push(
      "No side access is visible, so rear scaffold has to come through the property — modelled with a 15% uplift.",
    );
  } else if (o.sideAccess === "narrow" && sure(o, "sideAccess")) {
    effect.labourMultiplier *= 1.06;
  } else if (o.sideAccess === "none_visible" || o.sideAccess === "narrow") {
    // Suspected but not seen clearly. Every other field widens the band in this
    // situation and this one did not, which was an oversight rather than a
    // decision — and it is the field most often uncertain, because a front-on
    // photograph frequently cannot show whether a side gate exists. Leaving it
    // silent meant the single most common unknown in the whole set produced no
    // signal at all.
    effect.extraConfidence += 0.03;
  }

  if (
    o.obstructions.includes("mature_trees") ||
    o.obstructions.includes("steep_ground")
  ) {
    effect.labourMultiplier *= 1.05;
    effect.notes.push(
      "Trees or sloping ground next to the elevations add time to erect and strike the scaffold.",
    );
  }

  // ── Stale imagery ───────────────────────────────────────────────────────
  // Street View is often years old. An extension, a new drive or a felled tree
  // may simply not be in the picture, so old imagery earns a wider band rather
  // than a discount on trust.
  const age = o.imageryYear ? new Date().getFullYear() - o.imageryYear : null;
  if (age !== null && age >= 5) {
    effect.extraConfidence += 0.03;
    effect.notes.push(
      `Street imagery for this address is from ${o.imageryYear}, so recent changes may not be reflected.`,
    );
  }

  // Cap the compounded uplift at the top of the published band. Individually
  // each factor is defensible; multiplied together they could imply a premium
  // no cost guide supports, and an estimate that high is one a roofer throws
  // away rather than argues with.
  const CAP = 1.3;
  if (effect.labourMultiplier > CAP) effect.labourMultiplier = CAP;

  return effect;
}
