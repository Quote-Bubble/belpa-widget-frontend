import {
  MODEL_DEFAULTS,
  PRICE_LIST,
  REPAIR_SIZE_BANDS,
  type PriceRate,
} from "@/config/rates";
import type {
  ConditionAnswer,
  Material,
  PricingMode,
  QuoteLineItem,
  QuoteResult,
  RepairMaterial,
  ReplacementMaterial,
  RoofType,
} from "@/lib/types";
import {
  getRateFromTable,
  type QuoteModelOverrides,
  type RateTable,
} from "@/lib/rate-table";

export type PricingContext = {
  table: RateTable;
  model: QuoteModelOverrides;
};

type LinearItemInput = {
  rateId:
    | "dry_ridge_m"
    | "dry_hip_m"
    | "grp_valley_m"
    | "gutter_replace_m"
    | "fascia_soffit_m";
  quantityM: number;
};

type BaseEstimateInput = {
  areaM2: number;
  storeys: number;
  scaffoldWeeks: number;
  includeSkip: boolean;
  conditionAnswer: ConditionAnswer;
  linearItems?: LinearItemInput[];
  accessMultiplier?: number;
  /** Fixed access line (MEWP / tower / allowance) instead of scaffold weeks. */
  fixedAccessExVat?: number;
  extraAssumptions?: string[];
  extraConfidence?: number;
  pricing?: PricingContext;
};

export type ReplacementEstimateInput = BaseEstimateInput & {
  material: ReplacementMaterial;
  roofType: RoofType;
  imageryQuality: string;
  imageryDateIsOld: boolean;
  polygonWasEdited: boolean;
  chimneyCount?: number;
  includeChimneyAllowance?: boolean;
};

export type RepairEstimateInput = BaseEstimateInput & {
  material: RepairMaterial;
};

export type RooflineEstimateInput = {
  gutterLengthM: number;
  includeFascias: boolean;
  storeys: number;
  scaffoldWeeks: number;
  accessMultiplier?: number;
  fixedAccessExVat?: number;
  extraAssumptions?: string[];
  extraConfidence?: number;
  pricing?: PricingContext;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToNearestFifty(value: number) {
  return Math.max(50, Math.round(value / 50) * 50);
}

function ratesOf(ctx?: PricingContext): RateTable {
  return ctx?.table ?? PRICE_LIST;
}

function modelOf(ctx?: PricingContext): QuoteModelOverrides {
  return (
    ctx?.model ?? {
      stripOffPerM2: MODEL_DEFAULTS.stripOffPerM2,
      stripOffMin: MODEL_DEFAULTS.stripOffMin,
      stripOffMax: MODEL_DEFAULTS.stripOffMax,
      vatRate: MODEL_DEFAULTS.vatRate,
      confidenceWidth: null,
    }
  );
}

function coveringRates(
  pricingMode: PricingMode,
  material: Material,
  roofType?: RoofType,
  table: RateTable = PRICE_LIST,
): PriceRate[] {
  const candidates = table.filter(
    (rate) =>
      rate.category === "covering" &&
      rate.pricingMode === pricingMode &&
      rate.unit === "m²" &&
      rate.min > 0,
  );

  if (material !== "not_sure") {
    const exact = candidates.find((rate) => rate.material === material);
    if (!exact) {
      throw new Error(
        `No ${pricingMode} covering rate exists for ${material}.`,
      );
    }
    return [exact];
  }

  if (pricingMode === "replacement" && roofType === "flat") {
    return candidates.filter((rate) => rate.material?.startsWith("flat_"));
  }
  if (pricingMode === "replacement") {
    return candidates.filter((rate) =>
      ["concrete_tile", "clay_tile", "natural_slate"].includes(
        rate.material ?? "",
      ),
    );
  }
  return candidates;
}

function combineRates(rates: PriceRate[]) {
  if (!rates.length) throw new Error("No applicable covering rates.");
  return {
    min: Math.min(...rates.map((rate) => rate.min)),
    max: Math.max(...rates.map((rate) => rate.max)),
    rateIds: rates.map((rate) => rate.id),
    source:
      rates.every((rate) => rate.source.title === rates[0].source.title)
        ? rates[0].source
        : null,
    label:
      rates.length === 1
        ? rates[0].label
        : `Unknown material (${rates.length} applicable rates)`,
  };
}

function rateLineItem(
  rate: PriceRate,
  quantity: number,
  detail?: string,
): QuoteLineItem {
  return {
    label: rate.label,
    detail,
    min: rate.min * quantity,
    max: rate.max * quantity,
    rateId: rate.id,
    unit: rate.unit,
    quantity,
    unitRateMin: rate.min,
    unitRateMax: rate.max,
    sourceTitle: rate.source.title,
    sourceAsOf: rate.source.asOf,
  };
}

function accessAndRooflineItems(input: BaseEstimateInput): QuoteLineItem[] {
  const items: QuoteLineItem[] = [];
  const table = ratesOf(input.pricing);
  const accessMultiplier = input.accessMultiplier ?? 1;
  const fixed = input.fixedAccessExVat ?? 0;
  if (fixed > 0) {
    items.push({
      label: "Access equipment",
      detail: "Fixed access allowance for this company",
      min: fixed,
      max: fixed,
      rateId: "fixed_access",
      unit: "fixed",
      quantity: 1,
      sourceTitle: "Roofer quote config",
      sourceAsOf: "live",
    });
  } else if (input.scaffoldWeeks > 0) {
    const scaffold = getRateFromTable(table, "scaffold_week");
    const item = rateLineItem(
      scaffold,
      input.scaffoldWeeks,
      `${input.scaffoldWeeks} week(s), ${input.storeys} storey context${
        accessMultiplier !== 1
          ? `, ×${accessMultiplier.toFixed(2)} access`
          : ""
      }`,
    );
    if (accessMultiplier !== 1) {
      item.min *= accessMultiplier;
      item.max *= accessMultiplier;
      item.unitRateMin = (item.unitRateMin ?? scaffold.min) * accessMultiplier;
      item.unitRateMax = (item.unitRateMax ?? scaffold.max) * accessMultiplier;
    }
    items.push(item);
  }
  if (input.includeSkip) {
    items.push(
      rateLineItem(
        getRateFromTable(table, "skip_hire"),
        1,
        "Selected as required",
      ),
    );
  }
  for (const item of input.linearItems ?? []) {
    if (item.quantityM <= 0) continue;
    items.push(
      rateLineItem(
        getRateFromTable(table, item.rateId),
        item.quantityM,
        item.rateId === "gutter_replace_m" || item.rateId === "fascia_soffit_m"
          ? "Roofline rate from company config"
          : "Experimental Solar plane/bbox length estimate",
      ),
    );
  }
  return items;
}

function sumLineItems(items: QuoteLineItem[]) {
  return items.reduce(
    (totals, item) => ({
      min: totals.min + item.min,
      max: totals.max + item.max,
    }),
    { min: 0, max: 0 },
  );
}

export function repairSizeAdjustment(areaM2: number) {
  const safeArea = Math.max(0.1, areaM2);
  const band =
    REPAIR_SIZE_BANDS.find((candidate) => safeArea <= candidate.maxAreaM2) ??
    REPAIR_SIZE_BANDS[REPAIR_SIZE_BANDS.length - 1];
  return {
    ...band,
    areaM2: safeArea,
  };
}

export function calculateReplacementEstimate(
  input: ReplacementEstimateInput,
): QuoteResult {
  if (!Number.isFinite(input.areaM2) || input.areaM2 <= 0) {
    throw new Error("Replacement estimate requires a positive roof area.");
  }
  if (!Number.isFinite(input.storeys) || input.storeys < 1) {
    throw new Error("Replacement estimate requires a valid storey count.");
  }
  if (!Number.isFinite(input.scaffoldWeeks) || input.scaffoldWeeks < 0) {
    throw new Error("Replacement estimate requires a non-negative scaffold weeks.");
  }
  const table = ratesOf(input.pricing);
  const model = modelOf(input.pricing);
  const rates = combineRates(
    coveringRates("replacement", input.material, input.roofType, table),
  );
  const coveringMin = input.areaM2 * rates.min;
  const coveringMax = input.areaM2 * rates.max;
  const stripOff = clamp(
    input.areaM2 * model.stripOffPerM2,
    model.stripOffMin,
    model.stripOffMax,
  );

  const lineItems: QuoteLineItem[] = [
    {
      label: rates.label,
      detail: `${input.areaM2.toFixed(2)}m² × £${rates.min}–£${rates.max}`,
      min: coveringMin,
      max: coveringMax,
      rateId: rates.rateIds.join(","),
      unit: "m²",
      quantity: input.areaM2,
      quantityM2: input.areaM2,
      unitRateMin: rates.min,
      unitRateMax: rates.max,
      sourceTitle: rates.source?.title ?? "Multiple price-list sources",
      sourceAsOf: rates.source?.asOf,
    },
    {
      label: "Strip-off and preparation",
      detail: `£${model.stripOffPerM2}/m², capped £${model.stripOffMin}–£${model.stripOffMax}`,
      min: stripOff,
      max: stripOff,
      rateId: "model_strip_off",
      unit: "fixed",
      quantity: 1,
      sourceTitle: "Workbench modelling assumption",
      sourceAsOf: "2026-07",
    },
    ...accessAndRooflineItems(input),
  ];

  const chimneyCount = input.chimneyCount ?? 0;
  if (chimneyCount > 0 && input.includeChimneyAllowance !== false) {
    lineItems.push(
      rateLineItem(
        getRateFromTable(table, "chimney_flashing_allowance"),
        chimneyCount,
        `${chimneyCount} chimney(s), flashing allowance`,
      ),
    );
  }

  const base = sumLineItems(lineItems);
  let confidenceWidth =
    (model.confidenceWidth ?? 0.12) + (input.extraConfidence ?? 0);
  if (input.imageryQuality.toUpperCase() !== "HIGH") confidenceWidth += 0.08;
  if (input.imageryDateIsOld) confidenceWidth += 0.05;
  if (input.polygonWasEdited) confidenceWidth += 0.08;
  if (input.material === "not_sure") confidenceWidth += 0.1;

  const min = roundToNearestFifty(base.min * (1 - confidenceWidth));
  const conditionMultiplier = input.conditionAnswer === "yes" ? 1.1 : 1;
  const max = roundToNearestFifty(
    Math.max(base.max * (1 + confidenceWidth) * conditionMultiplier, min + 100),
  );

  return {
    estimateType: "indicative_estimate",
    pricingMode: "replacement",
    min,
    max,
    pricingAreaM2: input.areaM2,
    confidenceWidth,
    modelAssumptions: [
      "Replacement covering rates are from Checkatrade's 2026 roof replacement and flat-roof cost guides.",
      "Strip-off is modelled at £12/m², capped £1,000–£2,500, consistent with published basic strip-off (£8–£14/m²) and total removal (£1,000–£2,500) cost guides.",
      "Scaffolding uses the published £625/week guide; property type, pitch, and roof complexity apply access multipliers on top.",
      ...(input.linearItems?.length
        ? [
            "Gutter length reflects either the lines you drew directly, or an estimate from the satellite outline you traced, depending on property type.",
          ]
        : []),
      ...(input.extraAssumptions ?? []),
    ],
    lineItems,
  };
}

export function calculateRepairEstimate(
  input: RepairEstimateInput,
): QuoteResult {
  if (!Number.isFinite(input.areaM2) || input.areaM2 <= 0) {
    throw new Error("Repair estimate requires a positive repair area.");
  }
  if (!Number.isFinite(input.storeys) || input.storeys < 1) {
    throw new Error("Repair estimate requires a valid storey count.");
  }
  if (!Number.isFinite(input.scaffoldWeeks) || input.scaffoldWeeks < 0) {
    throw new Error("Repair estimate requires a non-negative scaffold weeks.");
  }
  const table = ratesOf(input.pricing);
  const model = modelOf(input.pricing);
  const rates = combineRates(
    coveringRates("repair", input.material, undefined, table),
  );
  const size = repairSizeAdjustment(input.areaM2);
  const adjustedMinRate = rates.min * size.rateMultiplier;
  const adjustedMaxRate = rates.max * size.rateMultiplier;

  const lineItems: QuoteLineItem[] = [
    {
      label: rates.label,
      detail: `${size.areaM2.toFixed(2)}m² × £${rates.min}–£${rates.max} × ${size.rateMultiplier.toFixed(2)} size factor`,
      min: size.areaM2 * adjustedMinRate,
      max: size.areaM2 * adjustedMaxRate,
      rateId: rates.rateIds.join(","),
      unit: "m²",
      quantity: size.areaM2,
      quantityM2: size.areaM2,
      unitRateMin: adjustedMinRate,
      unitRateMax: adjustedMaxRate,
      sourceTitle: rates.source?.title ?? "Multiple price-list sources",
      sourceAsOf: rates.source?.asOf,
    },
    ...accessAndRooflineItems(input),
  ];
  const base = sumLineItems(lineItems);
  let confidenceWidth =
    (model.confidenceWidth ?? 0.15) + (input.extraConfidence ?? 0);
  if (input.material === "not_sure") confidenceWidth += 0.15;

  const min = roundToNearestFifty(base.min * (1 - confidenceWidth));
  const conditionMultiplier = input.conditionAnswer === "yes" ? 1.1 : 1;
  const max = roundToNearestFifty(
    Math.max(base.max * (1 + confidenceWidth) * conditionMultiplier, min + 100),
  );

  return {
    estimateType: "indicative_estimate",
    pricingMode: "repair",
    min,
    max,
    pricingAreaM2: size.areaM2,
    confidenceWidth,
    modelAssumptions: [
      "Published Checkatrade repair rates apply to areas up to 3m².",
      `${size.label}: ${size.rateMultiplier.toFixed(2)}× rate multiplier. The source says larger-area rates fall but does not publish a curve; this piecewise multiplier is an explicit internal assumption.`,
      "Removal of damaged coverings is not included because the source says it must be added separately.",
      "Scaffolding and waste are included only when selected.",
      ...(input.linearItems?.length
        ? ["Experimental roof-line lengths are included despite low/medium geometry confidence."]
        : []),
      ...(input.extraAssumptions ?? []),
    ],
    lineItems,
  };
}

export function calculateRooflineEstimate(
  input: RooflineEstimateInput,
): QuoteResult {
  if (!Number.isFinite(input.gutterLengthM) || input.gutterLengthM < 0) {
    throw new Error("Roofline estimate requires a non-negative gutter length.");
  }
  if (!Number.isFinite(input.storeys) || input.storeys < 1) {
    throw new Error("Roofline estimate requires a valid storey count.");
  }
  if (!Number.isFinite(input.scaffoldWeeks) || input.scaffoldWeeks < 0) {
    throw new Error("Roofline estimate requires a non-negative scaffold weeks.");
  }
  const table = ratesOf(input.pricing);
  const model = modelOf(input.pricing);
  const length = Math.max(0, input.gutterLengthM);
  const lineItems: QuoteLineItem[] = [];

  if (length > 0) {
    lineItems.push(
      rateLineItem(
        getRateFromTable(table, "gutter_replace_m"),
        length,
        "Roofline rate from company config",
      ),
    );
    if (input.includeFascias) {
      lineItems.push(
        rateLineItem(
          getRateFromTable(table, "fascia_soffit_m"),
          length,
          "Roofline rate from company config",
        ),
      );
    }
  }

  lineItems.push(
    ...accessAndRooflineItems({
      areaM2: 0,
      storeys: input.storeys,
      scaffoldWeeks: input.scaffoldWeeks,
      includeSkip: false,
      conditionAnswer: "not_sure",
      accessMultiplier: input.accessMultiplier,
      fixedAccessExVat: input.fixedAccessExVat,
      pricing: input.pricing,
    }),
  );

  const base = sumLineItems(lineItems);
  const confidenceWidth =
    (model.confidenceWidth ?? 0.18) + (input.extraConfidence ?? 0);
  const min = roundToNearestFifty(base.min * (1 - confidenceWidth));
  const max = roundToNearestFifty(
    Math.max(base.max * (1 + confidenceWidth), min + 100),
  );

  return {
    estimateType: "indicative_estimate",
    pricingMode: "roofline",
    min,
    max,
    pricingAreaM2: null,
    confidenceWidth,
    modelAssumptions: [
      "Gutter and fascia rates are from Checkatrade's 2026 gutter and fascia/soffit cost guides.",
      "Length is taken from the gutter lines you drew on the satellite imagery.",
      ...(input.extraAssumptions ?? []),
    ],
    lineItems,
  };
}

/**
 * Roof cleaning priced per m² of measured roof area, floored at a call-out
 * minimum. Returns ex-VAT min/max like the roofing estimates (VAT is applied
 * at display time from the roofer's registration flag).
 */
export function calculateCleaningEstimate(input: {
  areaM2: number;
  ratePerM2ExVat: number;
  minCalloutExVat: number;
  label: string;
  extraAssumptions?: string[];
}): QuoteResult {
  if (!Number.isFinite(input.areaM2) || input.areaM2 <= 0) {
    throw new Error("Cleaning estimate requires a valid roof area.");
  }
  const rate = Math.max(0, input.ratePerM2ExVat);
  const floored = Math.max(input.areaM2 * rate, Math.max(0, input.minCalloutExVat));
  const lineItems: QuoteLineItem[] = [
    {
      label: input.label,
      detail: `${input.areaM2.toFixed(2)}m² × £${rate}/m²`,
      min: floored,
      max: floored,
      unit: "m²",
      quantity: input.areaM2,
      quantityM2: input.areaM2,
      unitRateMin: rate,
      unitRateMax: rate,
    },
  ];
  const confidenceWidth = 0.15;
  const min = roundToNearestFifty(floored * (1 - confidenceWidth));
  const max = roundToNearestFifty(
    Math.max(floored * (1 + confidenceWidth), min + 50),
  );
  return {
    estimateType: "indicative_estimate",
    pricingMode: "cleaning",
    min,
    max,
    pricingAreaM2: input.areaM2,
    confidenceWidth,
    modelAssumptions: [
      "Cleaning rates are this company's own pricing.",
      "Area is taken from the roof outline you drew on the satellite imagery.",
      ...(input.extraAssumptions ?? []),
    ],
    lineItems,
  };
}

/** A flat-price service (e.g. a gutter clear-out) with a tight band. */
export function calculateFlatEstimate(input: {
  amountExVat: number;
  label: string;
  extraAssumptions?: string[];
}): QuoteResult {
  const amount = Math.max(0, input.amountExVat);
  const lineItems: QuoteLineItem[] = [
    { label: input.label, min: amount, max: amount, unit: "fixed", quantity: 1 },
  ];
  const min = roundToNearestFifty(amount * 0.9);
  const max = roundToNearestFifty(Math.max(amount * 1.15, min + 50));
  return {
    estimateType: "indicative_estimate",
    pricingMode: "cleaning",
    min,
    max,
    pricingAreaM2: null,
    confidenceWidth: 0.12,
    modelAssumptions: [
      "Flat price from this company's own pricing.",
      ...(input.extraAssumptions ?? []),
    ],
    lineItems,
  };
}

export function displayQuoteAmount(amount: number, includesVat: boolean) {
  const value = includesVat
    ? amount * (1 + MODEL_DEFAULTS.vatRate)
    : amount;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(roundToNearestFifty(value));
}

/** Sum of raw line-item ranges before the confidence band is applied. */
export function quoteBaseSubtotal(quote: QuoteResult): {
  min: number;
  max: number;
} {
  return quote.lineItems.reduce(
    (totals, item) => ({
      min: totals.min + item.min,
      max: totals.max + item.max,
    }),
    { min: 0, max: 0 },
  );
}
