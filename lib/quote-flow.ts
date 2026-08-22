import { assessAccess } from "@/lib/access";
import { siteAccessEffect, type SiteObservation } from "@/lib/site-access";
import {
  boundsAreaM2,
  edgeLengthM,
  pathLengthM,
  polygonPerimeterM,
} from "@/lib/geo";
import {
  calculateCleaningEstimate,
  calculateFlatEstimate,
  calculateRepairEstimate,
  calculateReplacementEstimate,
  calculateRooflineEstimate,
  type PricingContext,
} from "@/lib/quote";
import { materialOptionsFor } from "@/lib/materials";
import {
  SERVICE_CATALOG,
  configFingerprint,
  type QuoteConfig,
  type ServiceKey,
} from "@/lib/quote-config";
import { buildRateTable, resolveAccessForService } from "@/lib/rate-table";
import { applySeverityToQuote } from "@/lib/severity";
import {
  isImageryOlderThanThreeYears,
  measureBoundary,
  measureDetached,
  pathFromBounds,
  ringsOverlapExcessively,
} from "@/lib/roof-geometry";
import type {
  ConditionAnswer,
  ContactDetails,
  DamageSeverity,
  DrawnRoof,
  JobType,
  LatLng,
  LeadPayload,
  Material,
  PropertyType,
  QuoteResult,
  RepairMaterial,
  ReplacementMaterial,
  RoofMeasurement,
  RooflineScope,
  RoofType,
  SolarScan,
  StoreyBand,
} from "@/lib/types";

export type { PropertyType, StoreyBand };

export type FlowStepId =
  | "address"
  | "job_type"
  | "property_type"
  | "storeys"
  | "locate"
  | "draw_roof"
  | "repair_size"
  | "material"
  | "roofline_scope"
  | "photos"
  | "contact"
  | "estimate"
  | "quote_next"
  | "consultation";

export type FlowPath =
  "measured" | "repair" | "roofline" | "flat" | "consultation";

export type QuoteFlowAnswers = {
  rooferId: string;
  address: { line: string; postcode: string; formatted: string | null };
  jobType: JobType | null;
  otherJobDescription: string;
  propertyType: PropertyType | null;
  storeys: StoreyBand | null;
  /** Kept for lead payload compatibility; the condition question is removed. */
  condition: ConditionAnswer | null;
  coords: LatLng | null;
  scan: SolarScan | null;
  /** Set when the measured path had to degrade (scan failed, maps unavailable). */
  fallbackReason: string | null;
  /** Closed user-drawn roof outlines with gutter edges and obstructions.
   *  Used only when drawApproach() is "outline" (see below). */
  roofs: DrawnRoof[];
  /** Open gutter-run polylines, drawn directly rather than clicked off a
   *  face's edges. Used when drawApproach() is "gutter_lines". */
  gutterRuns: LatLng[][];
  /** What the vision pass saw around the property, if it ran. Null means the
   *  feature is off, still in flight, or it could not see — all of which price
   *  identically to how the engine priced before it existed. */
  siteObservation: SiteObservation | null;
  chimneyCount: number;
  rooflightCount: number;
  repairBandId: string | null;
  material: Material | null;
  rooflineScope: RooflineScope | null;
  /** Compressed damage photos the customer attached on the "photos" step. */
  photos: File[];
  /** Storage paths returned by /api/severity, carried into the lead payload. */
  photoPaths: string[];
  /** Graded 1-5 from those photos. Null whenever it must not affect pricing:
   *  no photos, grader unavailable, or a low-confidence verdict. */
  severity: DamageSeverity | null;
  contact: ContactDetails;
};

export function createFlowAnswers(
  rooferId: string,
  address?: Partial<QuoteFlowAnswers["address"]>,
): QuoteFlowAnswers {
  return {
    rooferId,
    address: { line: "", postcode: "", formatted: null, ...address },
    jobType: null,
    otherJobDescription: "",
    propertyType: null,
    storeys: null,
    condition: null,
    coords: null,
    scan: null,
    fallbackReason: null,
    roofs: [],
    gutterRuns: [],
    siteObservation: null,
    chimneyCount: 0,
    rooflightCount: 0,
    repairBandId: null,
    material: null,
    rooflineScope: null,
    photos: [],
    photoPaths: [],
    severity: null,
    contact: { name: "", phone: "", email: "" },
  };
}

/** Human-readable location for quote screens when no pin-derived address exists. */
export function displayAddress(address: QuoteFlowAnswers["address"]): string {
  return address.formatted?.trim() || address.line.trim() || address.postcode;
}

function newRoofId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `roof-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyDrawnRoof(path: LatLng[] = []): DrawnRoof {
  return { id: newRoofId(), path, gutterEdgeIndices: [], obstructions: [] };
}

/**
 * Whether the draw step should have the user trace their roof's area, or
 * only mark where the gutters run.
 *
 * - "gutters_fascias_soffits" only ever prices gutter length, tracing a
 *   footprint first was always just a mechanism for clicking its edges, not
 *   something the pricing needed, so gutter lines are drawn directly for
 *   every property type.
 * - A detached house or bungalow's whole-building envelope from the Solar
 *   scan already *is* the customer's complete roof, with no neighbour to
 *   disambiguate, so its area comes straight from the scan and there's
 *   nothing to trace. Semi-detached, terraced, and flats often share a
 *   roof structure with next door, so the scan can't tell whose portion is
 *   whose; those still need a manual outline.
 */
export type DrawApproach = "outline" | "gutter_lines" | "scan_only";

export function drawApproach(
  jobType: JobType | null,
  propertyType: PropertyType | null,
): DrawApproach {
  if (jobType === "gutters_fascias_soffits") return "gutter_lines";
  // Cleaning is priced off roof area — always trace the outline.
  if (jobType === "roof_soft_wash" || jobType === "roof_biocide_treatment") {
    return "outline";
  }
  if (propertyType === "detached" || propertyType === "bungalow") {
    // Nothing to draw. The scan already gives the whole roof area, and area is
    // what a replacement is priced on — so the drawing step existed only to
    // collect gutter length.
    //
    // That is a bad trade. Tracing gutter runs on a satellite image is the
    // hardest thing we ask of a homeowner, it sits right before the price they
    // came for, and it buys one minor line item on a figure the roofer confirms
    // at survey anyway. Gutters move to the visit; the estimate goes straight
    // through.
    return "scan_only";
  }
  return "outline";
}

/* ------------------------------------------------------------------ */
/* Question options (single source of truth for steps + tests)         */
/* ------------------------------------------------------------------ */

export type FlowOption<Value extends string | number> = {
  value: Value;
  label: string;
  hint?: string;
};

/**
 * Hints for the choices that cannot end in a price.
 *
 * Two of the nine job types route to "consultation": there is no pricing model
 * for a leak investigation or for "something else", so the flow collects a
 * phone number and stops. A tester picked one, reached "Your local roofer will
 * call you back", and reported he could not work out how to get a quote — a
 * fair reading, since nothing up to that point suggested this branch had no
 * price at the end of it.
 *
 * The system already knew. SERVICE_CATALOG carries `priced: false` on exactly
 * these two, and it was surfaced to the roofer in the dashboard editor and to
 * nobody in the flow. Deriving the hint from that flag rather than repeating
 * the list here means adding a service cannot silently create a third
 * unsignposted dead end.
 */
const UNPRICED_HINTS: Partial<Record<JobType, string>> = {
  leak_investigation:
    "This one needs a visit to price so a roofer will call you back to arrange one",
  other: "Tell us what you need and a roofer will call you back",
};

function jobTypeHint(value: JobType): string | undefined {
  const meta = SERVICE_CATALOG.find((service) => service.key === value);
  if (!meta || meta.priced) return undefined;
  return UNPRICED_HINTS[value] ?? "A roofer will call you back about this one";
}

export const JOB_TYPE_OPTIONS: FlowOption<JobType>[] = (
  [
    { value: "full_replacement", label: "Full roof replacement" },
    { value: "tile_or_slate_repair", label: "Tile or slate repair" },
    { value: "flat_roof_replacement", label: "New flat roof" },
    { value: "leak_investigation", label: "Leak investigation" },
    { value: "gutters_fascias_soffits", label: "Gutters, fascias & soffits" },
    { value: "roof_soft_wash", label: "Roof soft wash / moss removal" },
    { value: "roof_biocide_treatment", label: "Biocide treatment" },
    { value: "gutter_clearing", label: "Gutter clearing" },
    { value: "other", label: "Something else" },
  ] as FlowOption<JobType>[]
).map((option) => ({ ...option, hint: jobTypeHint(option.value) }));

/** Cleaning jobs priced per m² of measured roof (draw the roof, no material). */
export const CLEANING_MEASURED_JOB_TYPES: JobType[] = [
  "roof_soft_wash",
  "roof_biocide_treatment",
];

export const PROPERTY_TYPE_OPTIONS: FlowOption<PropertyType>[] = [
  { value: "detached", label: "Detached" },
  { value: "semi_detached", label: "Semi-detached" },
  { value: "end_of_terrace", label: "End of terrace" },
  { value: "terraced", label: "Terraced" },
  { value: "bungalow", label: "Bungalow" },
  { value: "flat", label: "Flat" },
];

export const STOREY_OPTIONS: FlowOption<StoreyBand>[] = [
  { value: 1, label: "One" },
  { value: 2, label: "Two" },
  { value: 3, label: "Three" },
  { value: 4, label: "Four or more" },
];

export const ROOFLINE_SCOPE_OPTIONS: FlowOption<RooflineScope>[] = [
  {
    value: "gutters_only",
    label: "Just gutters",
    hint: "Replace the gutter runs you marked",
  },
  {
    value: "gutters_fascias",
    label: "Gutters + fascias & soffits",
    hint: "Gutter runs plus matching fascia / soffit length",
  },
];

export type RepairBand = {
  id: string;
  label: string;
  hint: string;
  representativeAreaM2: number;
};

export const REPAIR_BANDS: RepairBand[] = [
  {
    id: "patch",
    label: "A small patch",
    hint: "A few tiles, up to about 3 m²",
    representativeAreaM2: 2,
  },
  {
    id: "section",
    label: "A section of the roof",
    hint: "Roughly 3–10 m²",
    representativeAreaM2: 6,
  },
  {
    id: "large",
    label: "A large area",
    hint: "Roughly 10–25 m²",
    representativeAreaM2: 17,
  },
  {
    id: "half_roof",
    label: "Half the roof or more",
    hint: "Over 25 m²",
    representativeAreaM2: 35,
  },
];

export function repairBandById(id: string | null): RepairBand | null {
  return REPAIR_BANDS.find((band) => band.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Step sequencing                                                     */
/* ------------------------------------------------------------------ */

const MEASURED_JOB_TYPES: JobType[] = [
  "full_replacement",
  "flat_roof_replacement",
];

export function flowPath(answers: QuoteFlowAnswers): FlowPath {
  const { jobType } = answers;
  if (jobType === null) return "measured";
  if (MEASURED_JOB_TYPES.includes(jobType)) {
    return answers.fallbackReason ? "consultation" : "measured";
  }
  if (CLEANING_MEASURED_JOB_TYPES.includes(jobType)) {
    return answers.fallbackReason ? "consultation" : "measured";
  }
  if (jobType === "gutter_clearing") return "flat";
  if (jobType === "tile_or_slate_repair") return "repair";
  if (jobType === "gutters_fascias_soffits") {
    return answers.fallbackReason ? "consultation" : "roofline";
  }
  return "consultation";
}

/**
 * The job types that offer the damage-photo step: the ones priced with no
 * measured area at all, where extent is otherwise invisible to the estimate.
 * A size band, a linear metre count and a flat fee each say nothing about how
 * bad the problem actually is.
 *
 * Deliberately excludes leak_investigation — UK industry guidance is explicit
 * that a leak's source cannot be diagnosed from photographs because water
 * travels far from where it enters, and that path is an unpriced consultation
 * anyway. Also excludes the cleaning services, which already get a measured
 * area from the drawn outline.
 *
 * Must stay in step with SEVERITY_JOB_TYPES in the backend's severity-prompt.
 */
export const PHOTO_JOB_TYPES: JobType[] = [
  "tile_or_slate_repair",
  "gutters_fascias_soffits",
  "gutter_clearing",
];

export function offersPhotoStep(jobType: JobType | null): boolean {
  return jobType !== null && PHOTO_JOB_TYPES.includes(jobType);
}

export function stepSequence(answers: QuoteFlowAnswers): FlowStepId[] {
  const steps = ((): FlowStepId[] => {
    switch (flowPath(answers)) {
      case "measured": {
        const measured: FlowStepId[] = [
          "address",
          "job_type",
          "property_type",
          "storeys",
          "locate",
          "draw_roof",
          "material",
          "contact",
          "estimate",
          "quote_next",
        ];
        // Cleaning is measured by area but has no material choice.
        const isCleaning =
          answers.jobType === "roof_soft_wash" ||
          answers.jobType === "roof_biocide_treatment";
        const withoutMaterial = isCleaning
          ? measured.filter((step) => step !== "material")
          : measured;
        // Detached and bungalow take their area from the scan, so there is
        // nothing left for the draw step to collect (see drawApproach).
        return drawApproach(answers.jobType, answers.propertyType) ===
          "scan_only"
          ? withoutMaterial.filter((step) => step !== "draw_roof")
          : withoutMaterial;
      }
      case "repair":
        return [
          "address",
          "job_type",
          "property_type",
          "storeys",
          "repair_size",
          "material",
          "photos",
          "contact",
          "estimate",
          "quote_next",
        ];
      case "roofline":
        return [
          "address",
          "job_type",
          "property_type",
          "storeys",
          "locate",
          "draw_roof",
          "roofline_scope",
          "photos",
          "contact",
          "estimate",
          "quote_next",
        ];
      case "flat":
        return [
          "address",
          "job_type",
          "photos",
          "contact",
          "estimate",
          "quote_next",
        ];
      case "consultation":
        return ["address", "job_type", "contact", "consultation"];
    }
  })();
  const withPhotos = offersPhotoStep(answers.jobType)
    ? steps
    : steps.filter((step) => step !== "photos");
  // A bungalow is single-storey by definition, asking would be redundant.
  return answers.propertyType === "bungalow"
    ? withPhotos.filter((step) => step !== "storeys")
    : withPhotos;
}

export function nextStep(
  answers: QuoteFlowAnswers,
  current: FlowStepId,
): FlowStepId | null {
  const sequence = stepSequence(answers);
  const index = sequence.indexOf(current);
  if (index === sequence.length - 1) return null;
  if (index === -1) {
    // Orphaned step (not on this path). Common case: landed on draw_roof when
    // the path is scan_only — advance as if we just left locate.
    if (current === "draw_roof") {
      const locateIndex = sequence.indexOf("locate");
      if (locateIndex >= 0 && locateIndex < sequence.length - 1) {
        return sequence[locateIndex + 1];
      }
    }
    return null;
  }
  return sequence[index + 1];
}

export function previousStep(
  answers: QuoteFlowAnswers,
  current: FlowStepId,
): FlowStepId | null {
  const sequence = stepSequence(answers);
  const index = sequence.indexOf(current);
  if (index <= 0) return null;
  const previous = sequence[index - 1];
  // Never step "back" into the transient locate/scan screen; skip over it.
  return previous === "locate" ? (sequence[index - 2] ?? null) : previous;
}

export function progressPercent(
  answers: QuoteFlowAnswers,
  current: FlowStepId,
): number {
  const sequence = stepSequence(answers);
  const index = sequence.indexOf(current);
  if (index <= 0) return 0;
  return Math.round((index / (sequence.length - 1)) * 100);
}

/* ------------------------------------------------------------------ */
/* Measurement across one or more drawn roofs                          */
/* ------------------------------------------------------------------ */

export type CombinedMeasurement = {
  surfaceAreaM2: number;
  groundAreaM2: number;
  averagePitchDegrees: number;
  roofType: RoofType;
  method: RoofMeasurement["method"];
  perRoof: RoofMeasurement[];
  perimeterM: number;
  gutterLengthM: number;
  chimneyCount: number;
  rooflightCount: number;
};

function pitchMultiplier(averagePitchDegrees: number): number {
  const radians = (averagePitchDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  if (!Number.isFinite(cos) || cos <= 0.05) return 1;
  return 1 / cos;
}

export function measureRoofs(
  scan: SolarScan,
  roofs: DrawnRoof[],
): CombinedMeasurement | null {
  const perRoof: RoofMeasurement[] = [];
  let perimeterM = 0;
  let gutterLengthM = 0;
  let chimneyCount = 0;
  let rooflightCount = 0;
  let obstructionSurfaceM2 = 0;
  const acceptedPaths: LatLng[][] = [];

  for (const roof of roofs) {
    if (roof.path.length < 3) continue;
    // Reject outlines that overlap an already-accepted roof by >10% of the
    // new ring's area (defence in depth, DrawRoofStep also blocks this).
    if (
      acceptedPaths.some((existing) =>
        ringsOverlapExcessively(roof.path, existing),
      )
    ) {
      return null;
    }
    try {
      const measured = measureBoundary(scan, roof.path);
      perRoof.push(measured);
      acceptedPaths.push(roof.path);
      perimeterM += polygonPerimeterM(roof.path);
      for (const edgeIndex of roof.gutterEdgeIndices) {
        gutterLengthM += edgeLengthM(roof.path, edgeIndex);
      }
      const multiplier = pitchMultiplier(measured.averagePitchDegrees);
      for (const obstruction of roof.obstructions) {
        obstructionSurfaceM2 += boundsAreaM2(obstruction.bounds) * multiplier;
        if (obstruction.kind === "chimney") chimneyCount += 1;
        else rooflightCount += 1;
      }
    } catch {
      // Skip degenerate outlines; remaining roofs still measure.
    }
  }
  if (perRoof.length === 0) return null;

  const rawSurface = perRoof.reduce((sum, m) => sum + m.surfaceAreaM2, 0);
  const surfaceAreaM2 = Math.max(0, rawSurface - obstructionSurfaceM2);
  const groundAreaM2 = perRoof.reduce((sum, m) => sum + m.groundAreaM2, 0);
  const averagePitchDegrees =
    rawSurface > 0
      ? perRoof.reduce(
          (sum, m) => sum + m.averagePitchDegrees * m.surfaceAreaM2,
          0,
        ) / rawSurface
      : 0;
  const largest = perRoof.reduce((a, b) =>
    b.surfaceAreaM2 > a.surfaceAreaM2 ? b : a,
  );

  return {
    surfaceAreaM2,
    groundAreaM2,
    averagePitchDegrees,
    roofType: largest.roofType,
    method: largest.method,
    perRoof,
    perimeterM,
    gutterLengthM,
    chimneyCount,
    rooflightCount,
  };
}

/**
 * Area/pitch/type for the "gutter_lines" approach: taken directly from the
 * Solar scan's whole-roof stats (no user-drawn polygon involved). Gutter
 * length is the sum of whatever open gutter-run lines were drawn; chimney
 * and rooflight counts come from the step's simple counters rather than
 * spatially-marked boxes.
 */
export function measureWholeRoof(
  scan: SolarScan,
  gutterRuns: LatLng[][],
  chimneyCount: number,
  rooflightCount: number,
): CombinedMeasurement {
  const whole = measureDetached(scan);
  const gutterLengthM = gutterRuns.reduce(
    (sum, run) => sum + pathLengthM(run),
    0,
  );
  return {
    surfaceAreaM2: whole.surfaceAreaM2,
    groundAreaM2: whole.groundAreaM2,
    averagePitchDegrees: whole.averagePitchDegrees,
    roofType: whole.roofType,
    method: whole.method,
    perRoof: [whole],
    perimeterM: 0,
    gutterLengthM,
    chimneyCount,
    rooflightCount,
  };
}

/* ------------------------------------------------------------------ */
/* Quote + lead payload                                                */
/* ------------------------------------------------------------------ */

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidMaterialForJob(
  jobType: JobType | null,
  material: Material | null,
  config?: QuoteConfig | null,
): material is Material {
  if (material === null) return false;
  return materialOptionsFor(jobType, config).some(
    (option) => option.value === material,
  );
}

/**
 * Price the flow, then let any graded photo severity reshape the range.
 *
 * The severity pass is deliberately the outermost layer rather than an input
 * to the estimators: with no usable severity `applySeverityToQuote` returns the
 * very same object, so "the customer skipped photos" and "this feature does not
 * exist" cannot drift apart. See lib/severity.ts.
 */
export function computeFlowQuote(
  answers: QuoteFlowAnswers,
  measurement: CombinedMeasurement | null,
  quoteConfig?: QuoteConfig | null,
): QuoteResult | null {
  const quote = computeBaseFlowQuote(answers, measurement, quoteConfig);
  if (!quote) return null;
  return applySeverityToQuote(quote, answers.severity);
}

function computeBaseFlowQuote(
  answers: QuoteFlowAnswers,
  measurement: CombinedMeasurement | null,
  quoteConfig?: QuoteConfig | null,
): QuoteResult | null {
  const path = flowPath(answers);
  const condition = answers.condition ?? "not_sure";
  const access = assessAccess(
    answers.scan,
    answers.storeys,
    answers.propertyType,
    path,
  );
  const storeys = access.estimatedStoreys;

  /* What we could see around the property, folded into the access numbers.
     Scaffolding is priced on two separate things and assessAccess only knows
     one: how many elevations need wrapping. This is the other — whether the
     scaffold can physically get there. With no observation the effect is
     neutral, so the estimate is exactly what it was before this existed. */
  const site = siteAccessEffect(answers.siteObservation);
  access.accessMultiplier *= site.labourMultiplier;
  access.extraConfidence += site.extraConfidence;
  access.notes.push(...site.notes);

  const { table, model, config } = buildRateTable(quoteConfig ?? null);
  const pricing: PricingContext = { table, model };
  const service = answers.jobType as ServiceKey | null;
  const resolved = resolveAccessForService(
    service,
    config,
    access.scaffoldWeeks,
    access.accessMultiplier,
  );

  // Roof cleaning — priced per m² of measured roof area, no material step.
  if (service === "roof_soft_wash" || service === "roof_biocide_treatment") {
    if (!measurement || !isFinitePositive(measurement.surfaceAreaM2)) {
      return null;
    }
    const clean =
      service === "roof_soft_wash"
        ? config.services.roof_soft_wash
        : config.services.roof_biocide_treatment;
    if (!clean) return null;
    try {
      return calculateCleaningEstimate({
        areaM2: measurement.surfaceAreaM2,
        ratePerM2ExVat: clean.ratePerM2ExVat,
        minCalloutExVat: clean.minCalloutExVat,
        label:
          service === "roof_soft_wash"
            ? "Roof soft wash / moss removal"
            : "Biocide treatment",
        extraAssumptions: access.notes,
      });
    } catch {
      return null;
    }
  }

  // Flat-price services (e.g. gutter clearing) — no measurement needed.
  if (service === "gutter_clearing") {
    const flat = config.services.gutter_clearing;
    if (!flat) return null;
    return calculateFlatEstimate({
      amountExVat: flat.fixedExVat,
      label: "Gutter clearing",
    });
  }

  if (path === "repair") {
    if (!isValidMaterialForJob(answers.jobType, answers.material, config))
      return null;
    const band = repairBandById(answers.repairBandId);
    if (!band || !isFinitePositive(band.representativeAreaM2)) return null;
    try {
      return calculateRepairEstimate({
        areaM2: band.representativeAreaM2,
        material: answers.material as RepairMaterial,
        storeys,
        scaffoldWeeks: resolved.scaffoldWeeks,
        fixedAccessExVat: resolved.fixedAccessExVat,
        includeSkip: false,
        conditionAnswer: condition,
        accessMultiplier: resolved.accessMultiplier,
        extraAssumptions: access.notes,
        extraConfidence: access.extraConfidence,
        pricing,
      });
    } catch {
      return null;
    }
  }

  if (path === "roofline") {
    if (!measurement || answers.rooflineScope === null) return null;
    if (
      !Number.isFinite(measurement.gutterLengthM) ||
      measurement.gutterLengthM <= 0
    ) {
      return null;
    }
    try {
      return calculateRooflineEstimate({
        gutterLengthM: measurement.gutterLengthM,
        includeFascias: answers.rooflineScope === "gutters_fascias",
        storeys,
        scaffoldWeeks: resolved.scaffoldWeeks,
        fixedAccessExVat: resolved.fixedAccessExVat,
        accessMultiplier: resolved.accessMultiplier,
        extraAssumptions: access.notes,
        extraConfidence: access.extraConfidence,
        pricing,
      });
    } catch {
      return null;
    }
  }

  if (path !== "measured" || !answers.scan || !measurement) return null;
  if (!isValidMaterialForJob(answers.jobType, answers.material, config))
    return null;
  if (
    !Number.isFinite(measurement.surfaceAreaM2) ||
    measurement.surfaceAreaM2 <= 0
  ) {
    return null;
  }

  const svcCfg =
    answers.jobType === "flat_roof_replacement"
      ? config.services.flat_roof_replacement
      : config.services.full_replacement;
  const includeSkip = svcCfg?.includeSkip ?? true;
  const includeGutters = svcCfg?.includeGutters ?? true;
  const includeChimney = svcCfg?.includeChimneyAllowance ?? true;

  const linearItems: {
    rateId: "gutter_replace_m";
    quantityM: number;
  }[] = [];
  if (
    includeGutters &&
    Number.isFinite(measurement.gutterLengthM) &&
    measurement.gutterLengthM > 0
  ) {
    linearItems.push({
      rateId: "gutter_replace_m",
      quantityM: measurement.gutterLengthM,
    });
  }

  try {
    return calculateReplacementEstimate({
      areaM2: measurement.surfaceAreaM2,
      roofType:
        answers.jobType === "flat_roof_replacement"
          ? "flat"
          : measurement.roofType,
      material: answers.material as ReplacementMaterial,
      storeys,
      scaffoldWeeks: resolved.scaffoldWeeks,
      fixedAccessExVat: resolved.fixedAccessExVat,
      includeSkip,
      imageryQuality: answers.scan.imageryQuality,
      imageryDateIsOld: isImageryOlderThanThreeYears(answers.scan.imageryDate),
      // Homeowner-drawn outlines keep the wider confidence band on purpose.
      polygonWasEdited: true,
      conditionAnswer: condition,
      linearItems,
      chimneyCount: measurement.chimneyCount,
      includeChimneyAllowance: includeChimney,
      accessMultiplier: resolved.accessMultiplier,
      extraAssumptions: access.notes,
      extraConfidence: access.extraConfidence,
      pricing,
    });
  } catch {
    return null;
  }
}

export function buildLeadPayload(
  answers: QuoteFlowAnswers,
  measurement: CombinedMeasurement | null,
  quote: QuoteResult | null,
  intent: LeadPayload["intent"],
  /** Map framing at submit time. Optional so existing callers/tests that
   *  never showed a map keep working — it stores as null. */
  mapView: LeadPayload["mapView"] = null,
  quoteConfig?: QuoteConfig | null,
): LeadPayload {
  const path = flowPath(answers);
  const primaryRoofPath =
    answers.roofs.length > 0
      ? answers.roofs.reduce((a, b) => (b.path.length > a.path.length ? b : a))
          .path
      : answers.scan
        ? pathFromBounds(answers.scan.boundingBox)
        : null;

  const cfg = quoteConfig ? buildRateTable(quoteConfig).config : null;

  return {
    rooferId: answers.rooferId,
    leadType: path === "consultation" ? "manual_consultation" : "quote",
    intent,
    jobType: answers.jobType ?? "other",
    otherJobDescription:
      answers.otherJobDescription.trim() === ""
        ? null
        : answers.otherJobDescription.trim(),
    address: {
      postcode: answers.address.postcode,
      line: answers.address.line,
      formatted: answers.address.formatted,
    },
    coords: answers.coords,
    solar: {
      areaM2: measurement?.surfaceAreaM2 ?? null,
      groundAreaM2: measurement?.groundAreaM2 ?? null,
      pitchDegrees: measurement?.averagePitchDegrees ?? null,
      roofType: measurement?.roofType ?? null,
      measurementMethod: measurement?.method ?? null,
      segmentContributions:
        measurement?.perRoof.flatMap((roof) => roof.contributions) ?? [],
      segments: answers.scan?.roofSegmentStats ?? [],
      wholeRoofStats: answers.scan?.wholeRoofStats ?? null,
      imageryQuality: answers.scan?.imageryQuality ?? null,
      imageryDate: answers.scan?.imageryDate ?? null,
    },
    polygonCoords: primaryRoofPath,
    mapView,
    conditionAnswer: answers.condition,
    conditionFlagged: answers.condition === "yes",
    material: answers.material,
    propertyType: answers.propertyType,
    storeys: answers.storeys,
    quoteRange: quote ? { minExVat: quote.min, maxExVat: quote.max } : null,
    contact: {
      name: answers.contact.name.trim(),
      phone: answers.contact.phone.trim(),
      email: answers.contact.email.trim(),
    },
    fallbackReason: answers.fallbackReason,
    timestamp: new Date().toISOString(),
    roofline:
      path === "roofline" || (measurement && measurement.gutterLengthM > 0)
        ? {
            perimeterM: measurement?.perimeterM ?? null,
            gutterLengthM: measurement?.gutterLengthM ?? null,
            scope: answers.rooflineScope,
          }
        : null,
    obstructions: measurement
      ? {
          chimneys: measurement.chimneyCount,
          rooflights: measurement.rooflightCount,
        }
      : null,
    pricingSnapshot: cfg
      ? {
          version: 1 as const,
          fingerprint: configFingerprint(cfg),
          enabledServices: cfg.enabledServices,
        }
      : null,
    // Null unless the customer actually attached photos, so leads from the
    // job types that never offer the step look exactly as they did before.
    damage:
      answers.photoPaths.length > 0 || answers.severity
        ? { photoPaths: answers.photoPaths, severity: answers.severity }
        : null,
  };
}
