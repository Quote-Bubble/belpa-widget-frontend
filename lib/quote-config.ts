/**
 * Service-first quote config — shared contract for admin onboarding,
 * Account edits, and (via API projection) the widget.
 */

export type ServiceKey =
  | "full_replacement"
  | "flat_roof_replacement"
  | "tile_or_slate_repair"
  | "gutters_fascias_soffits"
  | "roof_soft_wash"
  | "roof_biocide_treatment"
  | "gutter_clearing"
  | "driveway_cleaning"
  | "leak_investigation"
  | "other";

/** Roofing services enabled by default for a new roofer. */
export const ROOFING_SERVICE_KEYS: ServiceKey[] = [
  "full_replacement",
  "flat_roof_replacement",
  "tile_or_slate_repair",
  "gutters_fascias_soffits",
  "leak_investigation",
  "other",
];

/** Roof-cleaning services (a cleaner's starting set). */
export const CLEANING_SERVICE_KEYS: ServiceKey[] = [
  "roof_soft_wash",
  "roof_biocide_treatment",
  "gutter_clearing",
  // Exterior cleaning firms sell the drive on the same visit as the roof, so
  // a cleaner's starting set includes it.
  "driveway_cleaning",
];

export type AccessMode =
  | "scaffold_weeks"
  | "fixed_access"
  | "mewp_day"
  | "tower"
  | "none";

export type AccessPolicy = {
  mode: AccessMode;
  /** £/week for scaffold_weeks; £ fixed for fixed_access/mewp_day/tower. */
  rateExVat: number;
};

export type MaterialRate = {
  key: string;
  label: string;
  rateExVat: number;
  /** When false, material is hidden in the bubble for this service. */
  enabled: boolean;
};

export type ReplacementServiceConfig = {
  materials: MaterialRate[];
  stripOffPerM2: number;
  includeSkip: boolean;
  skipHireExVat: number;
  access: AccessPolicy;
  includeGutters: boolean;
  gutterPerMExVat: number;
  includeChimneyAllowance: boolean;
  chimneyAllowanceExVat: number;
};

export type RepairServiceConfig = {
  materials: MaterialRate[];
  access: AccessPolicy;
};

export type RooflineServiceConfig = {
  gutterPerMExVat: number;
  fasciaSoffitPerMExVat: number;
  access: AccessPolicy;
};

/** Cleaning priced per m² of measured roof area, with a call-out floor. */
export type AreaCleanServiceConfig = {
  ratePerM2ExVat: number;
  minCalloutExVat: number;
};

/**
 * Driveway cleaning. Area-priced like a roof wash, but with two things a roof
 * does not have.
 *
 * Surface changes the work, not just the finish: block paving has to be
 * re-sanded because washing strips the joints, and resin and natural stone
 * need gentler settings and more care. Those ride as multipliers on the base
 * rate rather than as separate services, because it is one job done to a
 * different material.
 *
 * And sealing is a genuinely separate second visit — the guides put cleaning
 * plus sealing at roughly double cleaning alone — so it is priced as its own
 * £/m² rather than folded into the base.
 */
export type DrivewayServiceConfig = {
  ratePerM2ExVat: number;
  minCalloutExVat: number;
  /** Optional second pass, priced per m² of the same area. */
  sealPerM2ExVat: number;
};

/** A flat-price service (e.g. a gutter clear-out). */
export type FlatServiceConfig = {
  fixedExVat: number;
};

export type ServiceConfigs = {
  full_replacement?: ReplacementServiceConfig;
  flat_roof_replacement?: ReplacementServiceConfig;
  tile_or_slate_repair?: RepairServiceConfig;
  gutters_fascias_soffits?: RooflineServiceConfig;
  roof_soft_wash?: AreaCleanServiceConfig;
  roof_biocide_treatment?: AreaCleanServiceConfig;
  gutter_clearing?: FlatServiceConfig;
  driveway_cleaning?: DrivewayServiceConfig;
};

export type QuoteConfig = {
  version: 1;
  enabledServices: ServiceKey[];
  services: ServiceConfigs;
  vatRegistered: boolean;
  /** Optional band widener (0.12 = ±12%). Null/undefined = widget default. */
  confidenceWidth?: number | null;
};

export type ServiceMeta = {
  key: ServiceKey;
  label: string;
  description: string;
  /** Needs rate variables in the editor. */
  priced: boolean;
};

export const SERVICE_CATALOG: ServiceMeta[] = [
  {
    key: "full_replacement",
    label: "Full roof replacement",
    description: "Pitched tile/slate replacements with measured area.",
    priced: true,
  },
  {
    key: "flat_roof_replacement",
    label: "New flat roof",
    description: "Bitumen, EPDM or GRP flat systems.",
    priced: true,
  },
  {
    key: "tile_or_slate_repair",
    label: "Tile or slate repair",
    description: "Smaller repair patches by material.",
    priced: true,
  },
  {
    key: "gutters_fascias_soffits",
    label: "Gutters, fascias & soffits",
    description: "Roofline work priced per metre.",
    priced: true,
  },
  {
    key: "roof_soft_wash",
    label: "Roof soft wash / moss removal",
    description: "Soft-wash clean priced per m² of measured roof.",
    priced: true,
  },
  {
    key: "roof_biocide_treatment",
    label: "Biocide treatment",
    description: "Long-acting moss treatment priced per m².",
    priced: true,
  },
  {
    key: "gutter_clearing",
    label: "Gutter clearing",
    description: "Flat-price gutter clear-out.",
    priced: true,
  },
  {
    key: "driveway_cleaning",
    label: "Driveway cleaning",
    description: "Priced per m² of the drive the customer marks out.",
    priced: true,
  },
  {
    key: "leak_investigation",
    label: "Leak investigation",
    description: "Callback lead — no instant price.",
    priced: false,
  },
  {
    key: "other",
    label: "Something else",
    description: "Catch-all callback lead — no instant price.",
    priced: false,
  },
];

export const PRICED_SERVICES = SERVICE_CATALOG.filter((s) => s.priced).map(
  (s) => s.key,
);

const PITCHED_MATERIALS: MaterialRate[] = [
  { key: "concrete_tile", label: "Concrete tile", rateExVat: 107, enabled: true },
  { key: "clay_tile", label: "Clay tile", rateExVat: 140, enabled: true },
  { key: "natural_slate", label: "Natural slate", rateExVat: 185, enabled: true },
];

const FLAT_MATERIALS: MaterialRate[] = [
  { key: "flat_bitumen", label: "Felt / bitumen", rateExVat: 72, enabled: true },
  { key: "flat_epdm", label: "EPDM rubber", rateExVat: 87, enabled: true },
  { key: "flat_grp", label: "GRP fibreglass", rateExVat: 100, enabled: true },
];

const REPAIR_MATERIALS: MaterialRate[] = [
  { key: "concrete_tile", label: "Concrete tile", rateExVat: 105, enabled: true },
  { key: "clay_tile", label: "Clay tile", rateExVat: 135, enabled: true },
  { key: "natural_slate", label: "Natural slate", rateExVat: 185, enabled: true },
  { key: "fibre_cement", label: "Fibre cement", rateExVat: 110, enabled: true },
  { key: "felt", label: "Felt", rateExVat: 265, enabled: true },
  { key: "flat_epdm", label: "EPDM rubber", rateExVat: 145, enabled: true },
  { key: "flat_grp", label: "GRP fibreglass", rateExVat: 155, enabled: true },
];

export function defaultAccess(mode: AccessMode = "scaffold_weeks"): AccessPolicy {
  if (mode === "none") return { mode: "none", rateExVat: 0 };
  if (mode === "scaffold_weeks") return { mode, rateExVat: 625 };
  if (mode === "mewp_day") return { mode, rateExVat: 280 };
  if (mode === "tower") return { mode, rateExVat: 120 };
  return { mode: "fixed_access", rateExVat: 350 };
}

export function defaultReplacementPitched(): ReplacementServiceConfig {
  return {
    materials: PITCHED_MATERIALS.map((m) => ({ ...m })),
    stripOffPerM2: 12,
    includeSkip: true,
    skipHireExVat: 260,
    access: defaultAccess("scaffold_weeks"),
    includeGutters: true,
    gutterPerMExVat: 50,
    includeChimneyAllowance: true,
    chimneyAllowanceExVat: 350,
  };
}

export function defaultReplacementFlat(): ReplacementServiceConfig {
  return {
    materials: FLAT_MATERIALS.map((m) => ({ ...m })),
    stripOffPerM2: 12,
    includeSkip: true,
    skipHireExVat: 260,
    access: defaultAccess("scaffold_weeks"),
    includeGutters: true,
    gutterPerMExVat: 50,
    includeChimneyAllowance: false,
    chimneyAllowanceExVat: 350,
  };
}

export function defaultRepair(): RepairServiceConfig {
  return {
    materials: REPAIR_MATERIALS.map((m) => ({ ...m })),
    access: defaultAccess("scaffold_weeks"),
  };
}

export function defaultRoofline(): RooflineServiceConfig {
  return {
    gutterPerMExVat: 50,
    fasciaSoffitPerMExVat: 67,
    access: defaultAccess("scaffold_weeks"),
  };
}

/* ------------------------------------------------------------------ */
/* Roof cleaning defaults                                              */
/*                                                                     */
/* Set against published 2026 UK cost guides — Checkatrade, MyJobQuote,*/
/* FixMyRoof, N&J Exterior Cleaning — cross-checked against the areas  */
/* this engine actually measures rather than the areas those guides    */
/* assume.                                                             */
/*                                                                     */
/* That distinction is the whole calibration. The guides quote both a  */
/* £/m² and a total, and the two disagree with each other: their own   */
/* totals divided by their own areas come out at £4.50–£7.30/m², while */
/* the rate they print is £8.50–£16. The totals agree across all four  */
/* sources, so the totals are the real evidence and the printed rate   */
/* is closer to marketing.                                             */
/*                                                                     */
/* Our areas are smaller than theirs because cleaning always traces an */
/* outline (drawApproach returns "outline" for wash and biocide on     */
/* every property type), so the customer marks their own roof rather   */
/* than the whole building. Measured medians across real leads:        */
/* terraced 42 m², semi-detached 49 m². A guide calling a semi's roof  */
/* 80–120 m² is describing something we measure as about half that, so */
/* a rate calibrated to their areas would under-quote badly on ours.   */
/*                                                                     */
/* Everything below is ex-VAT, which is what the config stores.        */
/* ------------------------------------------------------------------ */

/**
 * Soft wash — scrape, treat, low-pressure rinse. £/m² of measured roof.
 *
 * £10 puts the median semi (49 m²) at £490 before the ±15% band, quoting
 * £400–£550 against a market of £350–£650. It sits inside every published
 * band: Checkatrade £8.50–£14, FixMyRoof £12–£16 for soft wash and £8–£15
 * for hand removal with biocide, MyJobQuote £10–£20.
 *
 * Down from £14, which was the top of the soft-wash band and quoted £600–£800
 * for that same semi — over the market ceiling before any extras.
 *
 * The floor is £250 rather than £150 because every source agrees a real roof
 * clean does not happen below about £250–£300; N&J puts it plainly, that
 * anything under £300 for a full roof is a scrape rather than a clean.
 *
 * Known limit: a flat rate cannot express the economies of scale the guides
 * show, where £/m² falls as roofs get bigger. Any rate that centres a semi
 * correctly will over-quote a large roof. Repairs already solve this with
 * REPAIR_SIZE_BANDS; cleaning has no equivalent yet.
 */
export function defaultSoftWash(): AreaCleanServiceConfig {
  return { ratePerM2ExVat: 10, minCalloutExVat: 250 };
}

/**
 * Biocide on its own — no scrape, no rinse, applied and left to work.
 *
 * Standalone biocide is quoted at £100–£250 (FixMyRoof), £80–£200 (N&J) and
 * £50–£150 as an add-on to a wash. £3.50/m² puts a median semi at £172,
 * mid-range, and a terrace at £147.
 *
 * Down from £5, which put that semi at £245 — the very top of the standalone
 * range for the least labour-intensive job on the list.
 */
export function defaultBiocide(): AreaCleanServiceConfig {
  return { ratePerM2ExVat: 3.5, minCalloutExVat: 120 };
}

/**
 * Driveway cleaning — £/m² of the drive the customer marks out.
 *
 * Published 2026 totals, which agree closely across the guides:
 *   MyJobQuote   30 m² £100–£160 · 60 m² £150–£250 · 90 m² £225–£350
 *   MyBuilder    typical drive £250–£400, £350 for a medium one
 *   Checkatrade  £150–£250 for a standard 40–50 m², £80 minimum
 *
 * Divide those by their own areas and the rate falls hard with size: £3.30–
 * £5.30/m² at 30 m², but £2.50–£3.90/m² at 90 m². That taper is real — the
 * setup, the water and the drive-time are the same whatever the size — so it
 * is applied by drivewayRateMultiplier rather than pretended away — as a
 * continuous taper, so a square metre either way moves the price by pennies
 * instead of by fifty pounds at a band edge.
 *
 * £4.50/m² is the base for the smallest band, which quotes £100–£150 for a
 * 30 m² single drive, £200–£250 for a 60 m² double and £250–£350 for a 90 m²
 * large one — inside the published range at every size. Sealing at £4/m² on
 * top lands £200–£300, £350–£500 and £500–£650, against a market of
 * £200–£300, £300–£450 and £450–£650.
 *
 * The £80 floor is Checkatrade's stated minimum charge, and it is what stops a
 * badly-drawn ten-metre box quoting £50 for a job nobody would drive to.
 */
export function defaultDrivewayCleaning(): DrivewayServiceConfig {
  return { ratePerM2ExVat: 4.5, minCalloutExVat: 80, sealPerM2ExVat: 4 };
}

/**
 * Gutter clear-out — a flat fee, since it tracks gutter run and access far
 * more than roof area.
 *
 * £100 is the modal UK figure for a three-bed semi across MyBuilder,
 * MyJobQuote, FixMyRoof and Fantastic Services, which between them put the
 * range at £70–£130 with London 20–30% above. A semi carries roughly 20–25 m
 * of guttering.
 *
 * Down from £120, which sat near the top of that range as a national default.
 */
export function defaultGutterClearing(): FlatServiceConfig {
  return { fixedExVat: 100 };
}

/** All service configs at defaults — the editor reads rates from here even for
 *  services that aren't enabled yet, so toggling one on just works. */
function allDefaultServiceConfigs(): ServiceConfigs {
  return {
    full_replacement: defaultReplacementPitched(),
    flat_roof_replacement: defaultReplacementFlat(),
    tile_or_slate_repair: defaultRepair(),
    gutters_fascias_soffits: defaultRoofline(),
    roof_soft_wash: defaultSoftWash(),
    roof_biocide_treatment: defaultBiocide(),
    gutter_clearing: defaultGutterClearing(),
  };
}

/** Default config for a new roofer — roofing services enabled, cleaning off. */
export function defaultQuoteConfig(): QuoteConfig {
  return {
    version: 1,
    enabledServices: [...ROOFING_SERVICE_KEYS],
    services: allDefaultServiceConfigs(),
    vatRegistered: true,
    confidenceWidth: null,
  };
}

/** Preset for a roof-cleaning business — cleaning services on, roofing off. */
export function roofCleaningConfig(): QuoteConfig {
  return {
    version: 1,
    enabledServices: [...CLEANING_SERVICE_KEYS],
    services: allDefaultServiceConfigs(),
    vatRegistered: false,
    confidenceWidth: null,
  };
}

/** Legacy Account form → quote_config (dual-read). */
export function legacyToQuoteConfig(legacy: {
  materials: { key: string; label: string; rate: number }[];
  labourPerDay: number;
  minimumCallout: number;
  skipHire: number;
  scaffoldPerWeek: number;
  vatRegistered: boolean;
}): QuoteConfig {
  const cfg = defaultQuoteConfig();
  cfg.vatRegistered = legacy.vatRegistered;

  const rate = (key: string, fallback: number) => {
    const m = legacy.materials.find((x) => x.key === key);
    // Map old "felt" key → flat_bitumen
    if (!m && key === "flat_bitumen") {
      const felt = legacy.materials.find((x) => x.key === "felt");
      return felt?.rate ?? fallback;
    }
    return m?.rate ?? fallback;
  };

  const pitched = cfg.services.full_replacement!;
  pitched.materials = pitched.materials.map((m) => ({
    ...m,
    rateExVat: rate(m.key, m.rateExVat),
  }));
  pitched.skipHireExVat = legacy.skipHire;
  pitched.access = {
    mode: "scaffold_weeks",
    rateExVat: legacy.scaffoldPerWeek,
  };

  const flat = cfg.services.flat_roof_replacement!;
  flat.materials = flat.materials.map((m) => ({
    ...m,
    rateExVat: rate(m.key, m.rateExVat),
  }));
  flat.skipHireExVat = legacy.skipHire;
  flat.access = {
    mode: "scaffold_weeks",
    rateExVat: legacy.scaffoldPerWeek,
  };

  const repair = cfg.services.tile_or_slate_repair!;
  repair.materials = repair.materials.map((m) => ({
    ...m,
    rateExVat: rate(m.key, m.rateExVat),
  }));
  repair.access = {
    mode: "scaffold_weeks",
    rateExVat: legacy.scaffoldPerWeek,
  };

  const roofline = cfg.services.gutters_fascias_soffits!;
  roofline.access = {
    mode: "scaffold_weeks",
    rateExVat: legacy.scaffoldPerWeek,
  };

  return cfg;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function parseAccess(raw: unknown, fallback: AccessPolicy): AccessPolicy {
  if (!isObj(raw)) return fallback;
  const mode = raw.mode;
  const modes: AccessMode[] = [
    "scaffold_weeks",
    "fixed_access",
    "mewp_day",
    "tower",
    "none",
  ];
  if (typeof mode !== "string" || !modes.includes(mode as AccessMode)) {
    return fallback;
  }
  return {
    mode: mode as AccessMode,
    rateExVat: num(raw.rateExVat, fallback.rateExVat),
  };
}

function parseMaterials(
  raw: unknown,
  defaults: MaterialRate[],
): MaterialRate[] {
  if (!Array.isArray(raw)) return defaults.map((m) => ({ ...m }));
  return defaults.map((d) => {
    const match = raw.find(
      (x) => isObj(x) && x.key === d.key,
    ) as Record<string, unknown> | undefined;
    if (!match) return { ...d };
    return {
      key: d.key,
      label: d.label,
      rateExVat: num(match.rateExVat, d.rateExVat),
      enabled: bool(match.enabled, d.enabled),
    };
  });
}

function parseAreaClean(
  raw: unknown,
  defaults: AreaCleanServiceConfig,
): AreaCleanServiceConfig {
  if (!isObj(raw)) return { ...defaults };
  return {
    ratePerM2ExVat: num(raw.ratePerM2ExVat, defaults.ratePerM2ExVat),
    minCalloutExVat: num(raw.minCalloutExVat, defaults.minCalloutExVat),
  };
}

function parseReplacement(
  raw: unknown,
  defaults: ReplacementServiceConfig,
): ReplacementServiceConfig {
  if (!isObj(raw)) return { ...defaults, materials: defaults.materials.map((m) => ({ ...m })), access: { ...defaults.access } };
  return {
    materials: parseMaterials(raw.materials, defaults.materials),
    stripOffPerM2: num(raw.stripOffPerM2, defaults.stripOffPerM2),
    includeSkip: bool(raw.includeSkip, defaults.includeSkip),
    skipHireExVat: num(raw.skipHireExVat, defaults.skipHireExVat),
    access: parseAccess(raw.access, defaults.access),
    includeGutters: bool(raw.includeGutters, defaults.includeGutters),
    gutterPerMExVat: num(raw.gutterPerMExVat, defaults.gutterPerMExVat),
    includeChimneyAllowance: bool(
      raw.includeChimneyAllowance,
      defaults.includeChimneyAllowance,
    ),
    chimneyAllowanceExVat: num(
      raw.chimneyAllowanceExVat,
      defaults.chimneyAllowanceExVat,
    ),
  };
}

/** Normalise unknown JSON into a full QuoteConfig (fills defaults). */
export function parseQuoteConfig(raw: unknown): QuoteConfig {
  const base = defaultQuoteConfig();
  if (!isObj(raw) || raw.version !== 1) return base;

  const enabled = Array.isArray(raw.enabledServices)
    ? (raw.enabledServices.filter((k) =>
        SERVICE_CATALOG.some((s) => s.key === k),
      ) as ServiceKey[])
    : base.enabledServices;

  const servicesRaw = isObj(raw.services) ? raw.services : {};

  return {
    version: 1,
    enabledServices: enabled.length ? enabled : base.enabledServices,
    services: {
      full_replacement: parseReplacement(
        servicesRaw.full_replacement,
        defaultReplacementPitched(),
      ),
      flat_roof_replacement: parseReplacement(
        servicesRaw.flat_roof_replacement,
        defaultReplacementFlat(),
      ),
      tile_or_slate_repair: (() => {
        const d = defaultRepair();
        const r = servicesRaw.tile_or_slate_repair;
        if (!isObj(r)) return d;
        return {
          materials: parseMaterials(r.materials, d.materials),
          access: parseAccess(r.access, d.access),
        };
      })(),
      gutters_fascias_soffits: (() => {
        const d = defaultRoofline();
        const r = servicesRaw.gutters_fascias_soffits;
        if (!isObj(r)) return d;
        return {
          gutterPerMExVat: num(r.gutterPerMExVat, d.gutterPerMExVat),
          fasciaSoffitPerMExVat: num(
            r.fasciaSoffitPerMExVat,
            d.fasciaSoffitPerMExVat,
          ),
          access: parseAccess(r.access, d.access),
        };
      })(),
      roof_soft_wash: parseAreaClean(
        servicesRaw.roof_soft_wash,
        defaultSoftWash(),
      ),
      roof_biocide_treatment: parseAreaClean(
        servicesRaw.roof_biocide_treatment,
        defaultBiocide(),
      ),
      gutter_clearing: (() => {
        const d = defaultGutterClearing();
        const r = servicesRaw.gutter_clearing;
        if (!isObj(r)) return d;
        return { fixedExVat: num(r.fixedExVat, d.fixedExVat) };
      })(),
    },
    vatRegistered: bool(raw.vatRegistered, true),
    confidenceWidth:
      typeof raw.confidenceWidth === "number" &&
      Number.isFinite(raw.confidenceWidth)
        ? raw.confidenceWidth
        : null,
  };
}

export type Completeness = {
  enabledPriced: number;
  completePriced: number;
  ready: boolean;
  warnings: string[];
};

function replacementComplete(c: ReplacementServiceConfig): boolean {
  const enabledMats = c.materials.filter((m) => m.enabled);
  if (enabledMats.length === 0) return false;
  if (enabledMats.some((m) => m.rateExVat <= 0)) return false;
  if (c.access.mode !== "none" && c.access.rateExVat <= 0) return false;
  if (c.includeSkip && c.skipHireExVat <= 0) return false;
  return true;
}

function repairComplete(c: RepairServiceConfig): boolean {
  const enabledMats = c.materials.filter((m) => m.enabled);
  if (enabledMats.length === 0) return false;
  if (enabledMats.some((m) => m.rateExVat <= 0)) return false;
  if (c.access.mode !== "none" && c.access.rateExVat <= 0) return false;
  return true;
}

function rooflineComplete(c: RooflineServiceConfig): boolean {
  if (c.gutterPerMExVat <= 0 || c.fasciaSoffitPerMExVat <= 0) return false;
  if (c.access.mode !== "none" && c.access.rateExVat <= 0) return false;
  return true;
}

function areaCleanComplete(c: AreaCleanServiceConfig): boolean {
  return c.ratePerM2ExVat > 0;
}

function flatComplete(c: FlatServiceConfig): boolean {
  return c.fixedExVat > 0;
}

export function assessCompleteness(config: QuoteConfig): Completeness {
  const warnings: string[] = [];
  const enabledPriced = config.enabledServices.filter((k) =>
    PRICED_SERVICES.includes(k),
  );
  let completePriced = 0;

  for (const key of enabledPriced) {
    let ok = false;
    if (key === "full_replacement" && config.services.full_replacement) {
      ok = replacementComplete(config.services.full_replacement);
    } else if (
      key === "flat_roof_replacement" &&
      config.services.flat_roof_replacement
    ) {
      ok = replacementComplete(config.services.flat_roof_replacement);
    } else if (
      key === "tile_or_slate_repair" &&
      config.services.tile_or_slate_repair
    ) {
      ok = repairComplete(config.services.tile_or_slate_repair);
    } else if (
      key === "gutters_fascias_soffits" &&
      config.services.gutters_fascias_soffits
    ) {
      ok = rooflineComplete(config.services.gutters_fascias_soffits);
    } else if (key === "roof_soft_wash" && config.services.roof_soft_wash) {
      ok = areaCleanComplete(config.services.roof_soft_wash);
    } else if (
      key === "roof_biocide_treatment" &&
      config.services.roof_biocide_treatment
    ) {
      ok = areaCleanComplete(config.services.roof_biocide_treatment);
    } else if (key === "gutter_clearing" && config.services.gutter_clearing) {
      ok = flatComplete(config.services.gutter_clearing);
    }
    if (ok) completePriced += 1;
    else {
      const label =
        SERVICE_CATALOG.find((s) => s.key === key)?.label ?? key;
      warnings.push(`${label} needs rates before going live.`);
    }
  }

  if (enabledPriced.length === 0) {
    warnings.push("Enable at least one priced service for the quote bubble.");
  }

  return {
    enabledPriced: enabledPriced.length,
    completePriced,
    ready: enabledPriced.length > 0 && completePriced === enabledPriced.length,
    warnings,
  };
}

/** Stable fingerprint for lead audit snapshots. */
export function configFingerprint(config: QuoteConfig): string {
  const json = JSON.stringify(config);
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = (Math.imul(31, h) + json.charCodeAt(i)) | 0;
  }
  return `v1_${(h >>> 0).toString(16)}`;
}
