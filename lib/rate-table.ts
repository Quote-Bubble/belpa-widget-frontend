import { MODEL_DEFAULTS, PRICE_LIST, type PriceRate } from "@/config/rates";
import type {
  AccessPolicy,
  QuoteConfig,
  ReplacementServiceConfig,
  ServiceKey,
} from "@/lib/quote-config";
import { defaultQuoteConfig, parseQuoteConfig } from "@/lib/quote-config";

export type RateTable = PriceRate[];

export type QuoteModelOverrides = {
  stripOffPerM2: number;
  stripOffMin: number;
  stripOffMax: number;
  vatRate: number;
  confidenceWidth: number | null;
};

export type ResolvedAccess = {
  mode: AccessPolicy["mode"];
  /** Weeks for scaffold_weeks model; 0 otherwise. */
  scaffoldWeeks: number;
  /** Fixed £ line for fixed_access / mewp_day / tower. */
  fixedAccessExVat: number;
  accessMultiplier: number;
};

const REPLACEMENT_RATE_IDS: Record<string, string> = {
  concrete_tile: "replacement_concrete_m2",
  clay_tile: "replacement_clay_m2",
  natural_slate: "replacement_slate_m2",
  flat_bitumen: "replacement_flat_bitumen_m2",
  flat_epdm: "replacement_flat_epdm_m2",
  flat_grp: "replacement_flat_grp_m2",
};

const REPAIR_RATE_IDS: Record<string, string> = {
  concrete_tile: "repair_concrete_m2",
  clay_tile: "repair_clay_m2",
  natural_slate: "repair_slate_m2",
  fibre_cement: "repair_fibre_cement_m2",
  felt: "repair_felt_m2",
  flat_epdm: "repair_flat_epdm_m2",
  flat_grp: "repair_flat_grp_m2",
  flat_bitumen: "repair_flat_bitumen_m2",
};

function cloneList(): RateTable {
  return PRICE_LIST.map((r) => ({
    ...r,
    source: { ...r.source },
    notes: [...r.notes],
  }));
}

function setRate(table: RateTable, id: string, amount: number) {
  const row = table.find((r) => r.id === id);
  if (!row) return;
  row.min = amount;
  row.max = amount;
}

function applyReplacement(
  table: RateTable,
  cfg: ReplacementServiceConfig,
  pitched: boolean,
) {
  for (const m of cfg.materials) {
    const id = pitched
      ? REPLACEMENT_RATE_IDS[m.key]
      : REPLACEMENT_RATE_IDS[m.key];
    if (!id) continue;
    if (!m.enabled) {
      // Push unreachable by filtering materials in UI; also zero rates.
      setRate(table, id, 0);
    } else {
      setRate(table, id, m.rateExVat);
    }
  }
  setRate(table, "skip_hire", cfg.skipHireExVat);
  setRate(table, "gutter_replace_m", cfg.gutterPerMExVat);
  setRate(table, "chimney_flashing_allowance", cfg.chimneyAllowanceExVat);
  if (cfg.access.mode === "scaffold_weeks") {
    setRate(table, "scaffold_week", cfg.access.rateExVat);
  }
}

/** Build a rate table + model overrides from a roofer quote config. */
export function buildRateTable(config: QuoteConfig | null | undefined): {
  table: RateTable;
  model: QuoteModelOverrides;
  config: QuoteConfig;
} {
  const cfg = config ? parseQuoteConfig(config) : defaultQuoteConfig();
  const table = cloneList();

  const pitched = cfg.services.full_replacement;
  if (pitched) applyReplacement(table, pitched, true);

  const flat = cfg.services.flat_roof_replacement;
  if (flat) applyReplacement(table, flat, false);

  const repair = cfg.services.tile_or_slate_repair;
  if (repair) {
    for (const m of repair.materials) {
      const id = REPAIR_RATE_IDS[m.key];
      if (!id) continue;
      setRate(table, id, m.enabled ? m.rateExVat : 0);
    }
    if (repair.access.mode === "scaffold_weeks") {
      setRate(table, "scaffold_week", repair.access.rateExVat);
    }
  }

  const roofline = cfg.services.gutters_fascias_soffits;
  if (roofline) {
    setRate(table, "gutter_replace_m", roofline.gutterPerMExVat);
    setRate(table, "fascia_soffit_m", roofline.fasciaSoffitPerMExVat);
    if (roofline.access.mode === "scaffold_weeks") {
      setRate(table, "scaffold_week", roofline.access.rateExVat);
    }
  }

  const stripSource = pitched ?? flat;
  const model: QuoteModelOverrides = {
    stripOffPerM2: stripSource?.stripOffPerM2 ?? MODEL_DEFAULTS.stripOffPerM2,
    stripOffMin: MODEL_DEFAULTS.stripOffMin,
    stripOffMax: MODEL_DEFAULTS.stripOffMax,
    vatRate: MODEL_DEFAULTS.vatRate,
    confidenceWidth: cfg.confidenceWidth ?? null,
  };

  return { table, model, config: cfg };
}

export function getRateFromTable(table: RateTable, id: string): PriceRate {
  const rate = table.find((item) => item.id === id);
  if (!rate) throw new Error(`Unknown price-list rate: ${id}`);
  return rate;
}

export function resolveAccessForService(
  service: ServiceKey | null,
  config: QuoteConfig,
  modelledScaffoldWeeks: number,
  accessMultiplier: number,
): ResolvedAccess {
  let policy: AccessPolicy = {
    mode: "scaffold_weeks",
    rateExVat: 625,
  };
  if (service === "full_replacement" && config.services.full_replacement) {
    policy = config.services.full_replacement.access;
  } else if (
    service === "flat_roof_replacement" &&
    config.services.flat_roof_replacement
  ) {
    policy = config.services.flat_roof_replacement.access;
  } else if (
    service === "tile_or_slate_repair" &&
    config.services.tile_or_slate_repair
  ) {
    policy = config.services.tile_or_slate_repair.access;
  } else if (
    service === "gutters_fascias_soffits" &&
    config.services.gutters_fascias_soffits
  ) {
    policy = config.services.gutters_fascias_soffits.access;
  }

  if (policy.mode === "none") {
    return {
      mode: "none",
      scaffoldWeeks: 0,
      fixedAccessExVat: 0,
      accessMultiplier: 1,
    };
  }
  if (policy.mode === "scaffold_weeks") {
    return {
      mode: policy.mode,
      scaffoldWeeks: modelledScaffoldWeeks,
      fixedAccessExVat: 0,
      accessMultiplier,
    };
  }
  // fixed_access | mewp_day | tower
  return {
    mode: policy.mode,
    scaffoldWeeks: 0,
    fixedAccessExVat: policy.rateExVat,
    accessMultiplier: 1,
  };
}

export function enabledJobTypes(config: QuoteConfig): ServiceKey[] {
  return config.enabledServices;
}

export function enabledMaterialsFor(
  config: QuoteConfig,
  service: ServiceKey,
): string[] | null {
  if (service === "full_replacement") {
    return (
      config.services.full_replacement?.materials
        .filter((m) => m.enabled)
        .map((m) => m.key) ?? null
    );
  }
  if (service === "flat_roof_replacement") {
    return (
      config.services.flat_roof_replacement?.materials
        .filter((m) => m.enabled)
        .map((m) => m.key) ?? null
    );
  }
  if (service === "tile_or_slate_repair") {
    return (
      config.services.tile_or_slate_repair?.materials
        .filter((m) => m.enabled)
        .map((m) => m.key) ?? null
    );
  }
  return null;
}
