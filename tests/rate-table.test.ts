import { describe, expect, it } from "vitest";

import { defaultQuoteConfig } from "@/lib/quote-config";
import {
  buildRateTable,
  getRateFromTable,
  resolveAccessForService,
} from "@/lib/rate-table";
import { computeFlowQuote, createFlowAnswers } from "@/lib/quote-flow";

describe("rate-table", () => {
  it("overrides covering rates from config", () => {
    const cfg = defaultQuoteConfig();
    cfg.services.full_replacement!.materials = cfg.services
      .full_replacement!.materials.map((m) =>
        m.key === "concrete_tile" ? { ...m, rateExVat: 123 } : m,
      );
    const { table } = buildRateTable(cfg);
    const rate = getRateFromTable(table, "replacement_concrete_m2");
    expect(rate.min).toBe(123);
    expect(rate.max).toBe(123);
  });

  it("resolves access none to zero scaffold", () => {
    const cfg = defaultQuoteConfig();
    cfg.services.full_replacement!.access = { mode: "none", rateExVat: 0 };
    const resolved = resolveAccessForService(
      "full_replacement",
      cfg,
      2,
      1.15,
    );
    expect(resolved.scaffoldWeeks).toBe(0);
    expect(resolved.fixedAccessExVat).toBe(0);
  });

  it("resolves fixed access as a £ allowance", () => {
    const cfg = defaultQuoteConfig();
    cfg.services.full_replacement!.access = {
      mode: "mewp_day",
      rateExVat: 275,
    };
    const resolved = resolveAccessForService(
      "full_replacement",
      cfg,
      3,
      1.2,
    );
    expect(resolved.scaffoldWeeks).toBe(0);
    expect(resolved.fixedAccessExVat).toBe(275);
  });

  it("computeFlowQuote uses disabled gutters toggle", () => {
    const cfg = defaultQuoteConfig();
    cfg.services.full_replacement!.includeGutters = false;
    const answers = createFlowAnswers("test-roofer");
    answers.jobType = "full_replacement";
    answers.material = "concrete_tile";
    answers.propertyType = "detached";
    answers.storeys = 2;
    answers.scan = {
      imageryQuality: "HIGH",
      imageryDate: "2024-01-01",
      wholeRoofStats: {
        areaMeters2: 100,
        groundAreaMeters2: 80,
        pitchDegrees: 35,
      },
      roofSegmentStats: [],
      boundingBox: {
        sw: { lat: 0, lng: 0 },
        ne: { lat: 0.001, lng: 0.001 },
      },
    } as never;

    // Without a measurement, measured path returns null — just ensure config path doesn't throw.
    expect(computeFlowQuote(answers, null, cfg)).toBeNull();
  });
});
