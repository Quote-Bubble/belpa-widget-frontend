import { describe, expect, it } from "vitest";

import {
  noSiteEffect,
  siteAccessEffect,
  type SiteObservation,
} from "@/lib/site-access";

function obs(over: Partial<SiteObservation> = {}): SiteObservation {
  return {
    frontage: "unclear",
    vehicleAccess: "unclear",
    parkingRestriction: "unclear",
    sideAccess: "unclear",
    obstructions: [],
    imageryUsable: true,
    imageryYear: new Date().getFullYear(),
    confidence: {},
    ...over,
  };
}

describe("site access pricing", () => {
  it("does nothing at all when there is no observation", () => {
    const e = siteAccessEffect(null);
    expect(e).toEqual(noSiteEffect());
  });

  it("widens the band rather than pricing when imagery is unusable", () => {
    // Looked and could not see. That is different from "no access problems",
    // and quoting as though the site were known-easy would be a lie.
    const e = siteAccessEffect(obs({ imageryUsable: false }));
    expect(e.lineItems).toHaveLength(0);
    expect(e.labourMultiplier).toBe(1);
    expect(e.extraConfidence).toBeGreaterThan(0);
  });

  it("prices a pavement licence only when it is confident", () => {
    const confident = siteAccessEffect(
      obs({ frontage: "on_pavement", confidence: { frontage: 0.9 } }),
    );
    expect(confident.lineItems).toHaveLength(1);
    expect(confident.lineItems[0].min).toBe(120);
    expect(confident.lineItems[0].max).toBe(180);

    // Same observation, unsure. Must NOT invent a £140 line on a guess.
    const unsure = siteAccessEffect(
      obs({ frontage: "on_pavement", confidence: { frontage: 0.4 } }),
    );
    expect(unsure.lineItems).toHaveLength(0);
    expect(unsure.extraConfidence).toBeGreaterThan(0);
    expect(unsure.labourMultiplier).toBe(1);
  });

  it("never moves the price on a low-confidence observation", () => {
    const e = siteAccessEffect(
      obs({
        frontage: "on_pavement",
        vehicleAccess: "restricted",
        sideAccess: "none_visible",
        confidence: { frontage: 0.5, vehicleAccess: 0.5, sideAccess: 0.5 },
      }),
    );
    expect(e.lineItems).toHaveLength(0);
    expect(e.labourMultiplier).toBe(1);
    expect(e.extraConfidence).toBeGreaterThan(0);
  });

  it("charges more when scaffold cannot reach the rear", () => {
    const e = siteAccessEffect(
      obs({ sideAccess: "none_visible", confidence: { sideAccess: 0.9 } }),
    );
    expect(e.labourMultiplier).toBeCloseTo(1.15, 5);
  });

  it("caps the compounded uplift at the published ceiling", () => {
    // Every factor at once. Individually defensible, multiplied together they
    // would imply a premium no cost guide supports.
    const e = siteAccessEffect(
      obs({
        vehicleAccess: "restricted",
        parkingRestriction: "double_yellow",
        sideAccess: "none_visible",
        obstructions: ["mature_trees", "steep_ground"],
        confidence: {
          vehicleAccess: 0.9,
          parkingRestriction: 0.9,
          sideAccess: 0.9,
        },
      }),
    );
    expect(e.labourMultiplier).toBeLessThanOrEqual(1.3);
    expect(e.labourMultiplier).toBeCloseTo(1.3, 5);
  });

  it("widens the band for stale imagery instead of trusting it", () => {
    const fresh = siteAccessEffect(
      obs({ imageryYear: new Date().getFullYear() }),
    );
    const stale = siteAccessEffect(
      obs({ imageryYear: new Date().getFullYear() - 8 }),
    );
    expect(stale.extraConfidence).toBeGreaterThan(fresh.extraConfidence);
    expect(stale.labourMultiplier).toBe(fresh.labourMultiplier);
  });

  it("leaves an easy site completely untouched", () => {
    const e = siteAccessEffect(
      obs({
        frontage: "driveway_setback",
        vehicleAccess: "adjacent",
        parkingRestriction: "none_visible",
        sideAccess: "clear",
        confidence: {
          frontage: 0.95,
          vehicleAccess: 0.95,
          parkingRestriction: 0.95,
          sideAccess: 0.95,
        },
      }),
    );
    expect(e).toEqual(noSiteEffect());
  });

  it("widens the band when side access is suspected but not seen", () => {
    // The most commonly uncertain field: a front-on photo usually cannot show
    // whether a side gate exists. Must not charge, must not stay silent.
    const e = siteAccessEffect(
      obs({ sideAccess: "none_visible", confidence: { sideAccess: 0.5 } }),
    );
    expect(e.labourMultiplier).toBe(1);
    expect(e.extraConfidence).toBeGreaterThan(0);
  });
});
