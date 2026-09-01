import type {
  PricingMode,
  RepairMaterial,
  ReplacementMaterial,
} from "@/lib/types";

export type RateUnit = "m²" | "m" | "week" | "hour" | "day" | "fixed";

export type RateSource = {
  title: string;
  url: string | null;
  asOf: string;
  verification: string;
};

export type PriceRate = {
  id: string;
  label: string;
  category: "covering" | "roofline" | "access" | "labour" | "waste";
  pricingMode: PricingMode | "both";
  material?: ReplacementMaterial | RepairMaterial;
  unit: RateUnit;
  min: number;
  max: number;
  source: RateSource;
  notes: string[];
};

export const CHECKATRADE_REPAIR_SOURCE: RateSource = {
  title: "Checkatrade roof repair cost guide 2026",
  url: "https://www.checkatrade.com/blog/cost-guides/roof-repair-cost/",
  asOf: "2026-06",
  verification: "Published as verified by CIOB and RICS member estimators.",
};

export const PROJECT_REPLACEMENT_SOURCE: RateSource = {
  title: "Initial project replacement-rate brief",
  url: null,
  asOf: "2026-07",
  verification:
    "Unverified project input. Replace with contractor or estimator rates before production.",
};

export const CHECKATRADE_REPLACEMENT_SOURCE: RateSource = {
  title: "Checkatrade roof replacement cost guide 2026",
  url: "https://www.checkatrade.com/blog/cost-guides/roof-replacement-cost/",
  asOf: "2026-07",
  verification:
    "Published trade cost guide. Slate figure cross-checked against Checkatrade's dedicated slate-roof cost guide.",
};

export const CHECKATRADE_FLAT_ROOF_SOURCE: RateSource = {
  title: "Checkatrade flat roof replacement cost guide 2026",
  url: "https://www.checkatrade.com/blog/cost-guides/flat-roof-replacement-costs/",
  asOf: "2026-07",
  verification:
    "Published trade cost guide gives an overall figure (~£75/m²) and an EPDM-specific figure (~£85/m²); the bitumen/GRP split is interpolated using standard trade cost ordering (bitumen cheapest, GRP priciest) — not independently sourced per material.",
};

export const CHECKATRADE_GUTTER_SOURCE: RateSource = {
  title: "Checkatrade gutter replacement cost guide 2026",
  url: "https://www.checkatrade.com/blog/cost-guides/gutter-replacement-cost/",
  asOf: "2026-07",
  verification: "Published trade cost guide, uPVC/plastic guttering.",
};

export const CHECKATRADE_FASCIA_SOURCE: RateSource = {
  title: "Checkatrade fascia and soffit replacement cost guide 2026",
  url: "https://www.checkatrade.com/blog/cost-guides/fascia-soffit-guttering-replacement-cost/",
  asOf: "2026-07",
  verification:
    "Published trade cost guide, uPVC supply-and-fit. Figure excludes scaffolding, which this model prices as a separate line item.",
};

export const CHECKATRADE_CHIMNEY_SOURCE: RateSource = {
  title: "Checkatrade chimney flashing repair cost guide 2026",
  url: "https://www.checkatrade.com/blog/cost-guides/chimney-flashing-repair-cost/",
  asOf: "2026-07",
  verification:
    "Published trade cost guide. Figure excludes scaffolding and roof-tile replacement, both priced separately in this model.",
};

export const INTERNAL_MODEL_SOURCE: RateSource = {
  title: "Workbench modelling assumption",
  url: null,
  asOf: "2026-07",
  verification: "Internal assumption; displayed explicitly in calculation output.",
};

export const PRICE_LIST: PriceRate[] = [
  {
    id: "repair_flat_bitumen_m2",
    label: "Bitumen flat roof repair",
    category: "covering",
    pricingMode: "repair",
    material: "flat_bitumen",
    unit: "m²",
    min: 100,
    max: 140,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate for areas up to 3m².", "Excludes access equipment and VAT."],
  },
  {
    id: "repair_flat_grp_m2",
    label: "GRP fibreglass flat roof repair",
    category: "covering",
    pricingMode: "repair",
    material: "flat_grp",
    unit: "m²",
    min: 130,
    max: 180,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate for areas up to 3m².", "Excludes access equipment and VAT."],
  },
  {
    id: "repair_flat_epdm_m2",
    label: "EPDM rubber flat roof repair",
    category: "covering",
    pricingMode: "repair",
    material: "flat_epdm",
    unit: "m²",
    min: 120,
    max: 170,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate for areas up to 3m².", "Excludes access equipment and VAT."],
  },
  {
    id: "repair_clay_m2",
    label: "Plain clay tile repair",
    category: "covering",
    pricingMode: "repair",
    material: "clay_tile",
    unit: "m²",
    min: 110,
    max: 160,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate for areas up to 3m².", "Removal of damaged covering is additional."],
  },
  {
    id: "repair_concrete_m2",
    label: "Plain concrete tile repair",
    category: "covering",
    pricingMode: "repair",
    material: "concrete_tile",
    unit: "m²",
    min: 90,
    max: 120,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate for areas up to 3m².", "Removal of damaged covering is additional."],
  },
  {
    id: "repair_slate_m2",
    label: "Natural slate repair",
    category: "covering",
    pricingMode: "repair",
    material: "natural_slate",
    unit: "m²",
    min: 150,
    max: 220,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published Spanish natural slate repair rate for areas up to 3m²."],
  },
  {
    id: "repair_fibre_cement_m2",
    label: "Fibre cement tile repair",
    category: "covering",
    pricingMode: "repair",
    material: "fibre_cement",
    unit: "m²",
    min: 90,
    max: 130,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate for areas up to 3m²."],
  },
  {
    id: "repair_polycarbonate_m2",
    label: "Polycarbonate roof repair",
    category: "covering",
    pricingMode: "repair",
    material: "polycarbonate",
    unit: "m²",
    min: 120,
    max: 170,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate."],
  },
  {
    id: "repair_glass_plain_m2",
    label: "6mm plain glass roof repair",
    category: "covering",
    pricingMode: "repair",
    material: "glass_plain",
    unit: "m²",
    min: 85,
    max: 145,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate."],
  },
  {
    id: "repair_glass_laminated_m2",
    label: "6.4mm laminated glass roof repair",
    category: "covering",
    pricingMode: "repair",
    material: "glass_laminated",
    unit: "m²",
    min: 190,
    max: 316,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published repair rate."],
  },
  {
    id: "repair_felt_m2",
    label: "Felt roof repair",
    category: "covering",
    pricingMode: "repair",
    material: "felt",
    unit: "m²",
    min: 265,
    max: 265,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published typical repair figure."],
  },
  {
    id: "replacement_concrete_m2",
    label: "Concrete tile replacement",
    category: "covering",
    pricingMode: "replacement",
    material: "concrete_tile",
    unit: "m²",
    min: 85,
    max: 130,
    source: CHECKATRADE_REPLACEMENT_SOURCE,
    notes: ["Interlocking concrete tile, supply and fit."],
  },
  {
    id: "replacement_clay_m2",
    label: "Clay tile replacement",
    category: "covering",
    pricingMode: "replacement",
    material: "clay_tile",
    unit: "m²",
    min: 100,
    max: 180,
    source: CHECKATRADE_REPLACEMENT_SOURCE,
    notes: ["Supply and fit; premium/decorative clay finishes run above this range."],
  },
  {
    id: "replacement_slate_m2",
    label: "Natural slate replacement",
    category: "covering",
    pricingMode: "replacement",
    material: "natural_slate",
    unit: "m²",
    min: 160,
    max: 210,
    source: CHECKATRADE_REPLACEMENT_SOURCE,
    notes: [
      "From Checkatrade's dedicated slate-roof cost guide. Spanish slate runs cheaper (~£95–£125/m²); this range assumes a general natural slate spec.",
    ],
  },
  {
    id: "replacement_flat_bitumen_m2",
    label: "Bitumen/felt flat roof replacement",
    category: "covering",
    pricingMode: "replacement",
    material: "flat_bitumen",
    unit: "m²",
    min: 60,
    max: 85,
    source: CHECKATRADE_FLAT_ROOF_SOURCE,
    notes: ["Cheapest of the three flat systems — see source note on the material split."],
  },
  {
    id: "replacement_flat_epdm_m2",
    label: "EPDM rubber flat roof replacement",
    category: "covering",
    pricingMode: "replacement",
    material: "flat_epdm",
    unit: "m²",
    min: 75,
    max: 100,
    source: CHECKATRADE_FLAT_ROOF_SOURCE,
    notes: ["Directly sourced (~£85/m²) from the guide, banded ±~15%."],
  },
  {
    id: "replacement_flat_grp_m2",
    label: "GRP fibreglass flat roof replacement",
    category: "covering",
    pricingMode: "replacement",
    material: "flat_grp",
    unit: "m²",
    min: 85,
    max: 115,
    source: CHECKATRADE_FLAT_ROOF_SOURCE,
    notes: ["Priciest of the three flat systems — see source note on the material split."],
  },
  {
    id: "dry_ridge_m",
    label: "Dry ridge",
    category: "roofline",
    pricingMode: "both",
    unit: "m",
    min: 50,
    max: 70,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published linear-metre sundry rate."],
  },
  {
    id: "dry_hip_m",
    label: "Dry hip",
    category: "roofline",
    pricingMode: "both",
    unit: "m",
    min: 70,
    max: 100,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published linear-metre sundry rate."],
  },
  {
    id: "grp_valley_m",
    label: "GRP valley",
    category: "roofline",
    pricingMode: "both",
    unit: "m",
    min: 30,
    max: 40,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published linear-metre sundry rate."],
  },
  {
    id: "lead_flashing_m",
    label: "Lead flashing, Code 5",
    category: "roofline",
    pricingMode: "both",
    unit: "m",
    min: 50,
    max: 70,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Not exceeding 150mm; stepped flashing is a separate rate."],
  },
  {
    id: "stepped_lead_flashing_m",
    label: "Stepped lead flashing, Code 5",
    category: "roofline",
    pricingMode: "both",
    unit: "m",
    min: 80,
    max: 120,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Not exceeding 150mm."],
  },
  {
    id: "scaffold_week",
    label: "Single scaffold up to 10m",
    category: "access",
    pricingMode: "both",
    unit: "week",
    min: 625,
    max: 625,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published approximate weekly figure; site geometry can materially change cost."],
  },
  {
    id: "gutter_replace_m",
    label: "Gutter replacement",
    category: "roofline",
    pricingMode: "both",
    unit: "m",
    min: 40,
    max: 60,
    source: CHECKATRADE_GUTTER_SOURCE,
    notes: [
      "uPVC/plastic gutter, supply and fit — the most common spec. Cast iron and premium aluminium run well above this.",
    ],
  },
  {
    id: "fascia_soffit_m",
    label: "Fascias & soffits",
    category: "roofline",
    pricingMode: "both",
    unit: "m",
    min: 45,
    max: 90,
    source: CHECKATRADE_FASCIA_SOURCE,
    notes: ["uPVC supply and fit, scaffolding excluded (priced separately)."],
  },
  {
    id: "chimney_flashing_allowance",
    label: "Chimney flashing allowance",
    category: "roofline",
    pricingMode: "both",
    unit: "fixed",
    min: 250,
    max: 450,
    source: CHECKATRADE_CHIMNEY_SOURCE,
    notes: [
      "Per chimney, scaffolding and tile replacement excluded (priced separately where applicable).",
    ],
  },
  {
    id: "skip_hire",
    label: "Skip hire",
    category: "waste",
    pricingMode: "both",
    unit: "fixed",
    min: 125,
    max: 320,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Published range varies by skip size and location."],
  },
  {
    id: "roofer_hour",
    label: "Roofer hourly rate",
    category: "labour",
    pricingMode: "both",
    unit: "hour",
    min: 35,
    max: 45,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Guide rate; standard repairs are usually priced per job."],
  },
  {
    id: "roofer_day",
    label: "Roofer day rate",
    category: "labour",
    pricingMode: "both",
    unit: "day",
    min: 280,
    max: 360,
    source: CHECKATRADE_REPAIR_SOURCE,
    notes: ["Guide rate; standard repairs are usually priced per job."],
  },
];

/**
 * Driveway cleaning falls in price per m² as the drive gets bigger, and
 * steeply — far more than a roof does.
 *
 * From the published totals divided by their own areas:
 *   30 m²  £100–£160  ->  £3.30–£5.30/m²
 *   60 m²  £150–£250  ->  £2.50–£4.20/m²
 *   90 m²  £225–£350  ->  £2.50–£3.90/m²
 *
 * The reason is obvious once you look at the job: the setup, the water, the
 * generator and the drive-time are the same whether the drive is one car or
 * four, so only the washing time scales. Roof cleaning shows the same effect
 * but shallower — a flat rate there is a tolerable simplification, and here it
 * is not: a single flat rate that priced a 30 m² drive correctly would quote
 * roughly £450 for a 90 m² one against a market of £225–£350.
 *
 * These are anchors on a continuous curve, not bands. They started as bands
 * and that was wrong: with a step at 35 m², a drive measured at 35 quoted
 * £150–£200 and one at 36 quoted £100–£150. One square metre — well inside
 * the error of dragging a box on a satellite photo — moved the price by £50,
 * and two neighbours with near-identical drives would have seen different
 * quotes for no reason they could point at.
 */
export const DRIVEWAY_RATE_ANCHORS: { areaM2: number; multiplier: number }[] = [
  { areaM2: 30, multiplier: 1 },
  { areaM2: 60, multiplier: 0.85 },
  { areaM2: 90, multiplier: 0.75 },
  { areaM2: 150, multiplier: 0.68 },
];

/**
 * The rate multiplier for an area, interpolated between the anchors.
 *
 * Flat below the first anchor and above the last, straight lines between —
 * so the price moves smoothly with the shape the customer drags, and a
 * square metre either way is worth pennies rather than fifty pounds.
 */
export function drivewayRateMultiplier(areaM2: number): number {
  const a = Number.isFinite(areaM2) ? areaM2 : 0;
  const first = DRIVEWAY_RATE_ANCHORS[0];
  const last = DRIVEWAY_RATE_ANCHORS[DRIVEWAY_RATE_ANCHORS.length - 1];
  if (a <= first.areaM2) return first.multiplier;
  if (a >= last.areaM2) return last.multiplier;
  for (let i = 0; i < DRIVEWAY_RATE_ANCHORS.length - 1; i++) {
    const lo = DRIVEWAY_RATE_ANCHORS[i];
    const hi = DRIVEWAY_RATE_ANCHORS[i + 1];
    if (a <= hi.areaM2) {
      const t = (a - lo.areaM2) / (hi.areaM2 - lo.areaM2);
      return lo.multiplier + t * (hi.multiplier - lo.multiplier);
    }
  }
  return last.multiplier;
}

/**
 * What the surface does to the price.
 *
 * Block paving carries the biggest uplift because washing blows the kiln sand
 * out of the joints, so re-sanding is part of finishing the job rather than an
 * extra. Resin and natural stone need lower pressure and more care, so they
 * take longer for the same area. Concrete and tarmac are the plain case.
 *
 * Gravel has no multiplier because it never reaches a price: there is no
 * surface to clean, and a pressure washer would redistribute it across the
 * garden. The flow routes it to a callback instead.
 */
export const DRIVEWAY_SURFACE_MULTIPLIERS: Record<string, number> = {
  block_paving: 1.2,
  concrete: 1,
  tarmac: 1,
  resin: 1.15,
  natural_stone: 1.15,
};

export const REPAIR_SIZE_BANDS = [
  {
    id: "up_to_3",
    maxAreaM2: 3,
    rateMultiplier: 1,
    label: "Published small-repair rate",
  },
  {
    id: "3_to_10",
    maxAreaM2: 10,
    rateMultiplier: 0.9,
    label: "Modelled modest scale discount",
  },
  {
    id: "10_to_25",
    maxAreaM2: 25,
    rateMultiplier: 0.8,
    label: "Modelled medium scale discount",
  },
  {
    id: "over_25",
    maxAreaM2: Number.POSITIVE_INFINITY,
    rateMultiplier: 0.7,
    label: "Modelled large-area floor",
  },
] as const;

export const MODEL_DEFAULTS = {
  vatRate: 0.2,
  stripOffPerM2: 12,
  stripOffMin: 1_000,
  stripOffMax: 2_500,
} as const;

export function getRate(id: string): PriceRate {
  const rate = PRICE_LIST.find((item) => item.id === id);
  if (!rate) throw new Error(`Unknown price-list rate: ${id}`);
  return rate;
}
