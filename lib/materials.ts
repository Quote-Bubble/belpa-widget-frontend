import type { JobType, Material } from "@/lib/types";
import type { QuoteConfig, ServiceKey } from "@/lib/quote-config";
import { enabledMaterialsFor } from "@/lib/rate-table";

export type MaterialSwatchId =
  | "concrete"
  | "clay"
  | "slate"
  | "fibre"
  | "felt"
  | "epdm"
  | "grp"
  | "unknown";

export type MaterialOption = {
  value: Material;
  label: string;
  swatch: MaterialSwatchId;
};

export const PITCHED_REPLACEMENT_MATERIALS: MaterialOption[] = [
  { value: "concrete_tile", label: "Concrete tile", swatch: "concrete" },
  { value: "clay_tile", label: "Clay tile", swatch: "clay" },
  { value: "natural_slate", label: "Natural slate", swatch: "slate" },
  { value: "not_sure", label: "Not sure", swatch: "unknown" },
];

export const FLAT_REPLACEMENT_MATERIALS: MaterialOption[] = [
  { value: "flat_bitumen", label: "Felt / bitumen", swatch: "felt" },
  { value: "flat_epdm", label: "Rubber (EPDM)", swatch: "epdm" },
  { value: "flat_grp", label: "Fibreglass (GRP)", swatch: "grp" },
  { value: "not_sure", label: "Not sure", swatch: "unknown" },
];

export const REPAIR_MATERIALS: MaterialOption[] = [
  { value: "concrete_tile", label: "Concrete tile", swatch: "concrete" },
  { value: "clay_tile", label: "Clay tile", swatch: "clay" },
  { value: "natural_slate", label: "Natural slate", swatch: "slate" },
  { value: "fibre_cement", label: "Fibre cement", swatch: "fibre" },
  { value: "felt", label: "Felt", swatch: "felt" },
  { value: "flat_epdm", label: "Rubber (EPDM)", swatch: "epdm" },
  { value: "flat_grp", label: "Fibreglass (GRP)", swatch: "grp" },
  { value: "not_sure", label: "Not sure", swatch: "unknown" },
];

export function materialOptionsFor(
  jobType: JobType | null,
  config?: QuoteConfig | null,
): MaterialOption[] {
  let base: MaterialOption[];
  switch (jobType) {
    case "full_replacement":
      base = PITCHED_REPLACEMENT_MATERIALS;
      break;
    case "flat_roof_replacement":
      base = FLAT_REPLACEMENT_MATERIALS;
      break;
    case "tile_or_slate_repair":
      base = REPAIR_MATERIALS;
      break;
    default:
      return [];
  }

  if (!config || !jobType) return base;
  const enabled = enabledMaterialsFor(config, jobType as ServiceKey);
  if (!enabled) return base;
  return base.filter(
    (o) => o.value === "not_sure" || enabled.includes(o.value),
  );
}

export function materialLabel(value: Material | null): string {
  if (!value) return "Not specified";
  for (const option of REPAIR_MATERIALS.concat(
    PITCHED_REPLACEMENT_MATERIALS,
    FLAT_REPLACEMENT_MATERIALS,
  )) {
    if (option.value === value) return option.label;
  }
  return value.replace(/_/g, " ");
}
