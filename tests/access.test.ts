import { describe, expect, it } from "vitest";

import { assessAccess } from "@/lib/access";
import type { SolarScan } from "@/lib/types";

function scanWithHeights(
  heights: number[],
  pitches: number[] = heights.map(() => 30),
): SolarScan {
  return {
    center: { lat: 52, lng: 0 },
    boundingBox: { north: 52.01, south: 52, east: 0.01, west: 0 },
    imageryQuality: "HIGH",
    imageryDate: "2026-01-01",
    wholeRoofStats: { areaMeters2: 80, groundAreaMeters2: 70 },
    roofSegmentStats: heights.map((height, index) => ({
      pitchDegrees: pitches[index] ?? 30,
      azimuthDegrees: 90,
      areaMeters2: 40,
      groundAreaMeters2: 35,
      boundingBox: { north: 52.01, south: 52, east: 0.01, west: 0 },
      planeHeightAtCenterMeters: height,
    })),
  };
}

describe("assessAccess", () => {
  it("uses the storey answer alone for estimatedStoreys (ignores satellite height)", () => {
    // Tall satellite planes would previously have forced 3 storeys.
    const access = assessAccess(scanWithHeights([9]), 1, "detached");
    expect(access.estimatedStoreys).toBe(1);
    expect(access.scaffoldWeeks).toBe(1);
    expect(access.notes.every((note) => !note.includes("storey"))).toBe(true);
  });

  it("defaults storeysAnswer null to 2 storeys", () => {
    const access = assessAccess(null, null, "detached");
    expect(access.estimatedStoreys).toBe(2);
    expect(access.scaffoldWeeks).toBe(1);
  });

  it("drives scaffold weeks from the storey answer", () => {
    expect(assessAccess(null, 3, "detached").scaffoldWeeks).toBe(2);
    expect(assessAccess(null, 1, "detached").scaffoldWeeks).toBe(1);
    expect(assessAccess(null, 1, "detached", "repair").scaffoldWeeks).toBe(0);
    expect(assessAccess(null, 2, "detached", "repair").scaffoldWeeks).toBe(1);
  });

  it("applies attachment multipliers — standalone properties need a full scaffold wrap, terraced needs the fewest elevations", () => {
    const detached = assessAccess(null, 2, "detached");
    const bungalow = assessAccess(null, 2, "bungalow");
    const terraced = assessAccess(null, 2, "terraced");
    const semi = assessAccess(null, 2, "semi_detached");
    const flat = assessAccess(null, 2, "flat");
    expect(detached.accessMultiplier).toBeCloseTo(1.15);
    expect(bungalow.accessMultiplier).toBeCloseTo(1.15);
    expect(terraced.accessMultiplier).toBeCloseTo(0.9);
    expect(semi.accessMultiplier).toBeCloseTo(1.05);
    expect(flat.accessMultiplier).toBeCloseTo(1.2);
  });

  it("tiers the steep-pitch uplift instead of a single flat bump", () => {
    const moderate = assessAccess(scanWithHeights([5], [32]), 2, "detached");
    const steep = assessAccess(scanWithHeights([5], [42]), 2, "detached");
    const verySteep = assessAccess(scanWithHeights([5], [55]), 2, "detached");
    expect(moderate.steepPitch).toBe(true);
    expect(moderate.accessMultiplier).toBeCloseTo(1.15 * 1.15, 5);
    expect(steep.steepPitch).toBe(true);
    expect(steep.accessMultiplier).toBeCloseTo(1.35 * 1.15, 5);
    expect(verySteep.accessMultiplier).toBeCloseTo(1.55 * 1.15, 5);
    expect(verySteep.accessMultiplier).toBeGreaterThan(steep.accessMultiplier);
    expect(steep.accessMultiplier).toBeGreaterThan(moderate.accessMultiplier);
  });

  it("keeps repair scaffolding lighter", () => {
    const repair = assessAccess(scanWithHeights([5.5]), 2, "detached", "repair");
    expect(repair.scaffoldWeeks).toBe(1);
    const single = assessAccess(null, 1, "detached", "repair");
    expect(single.scaffoldWeeks).toBe(0);
  });
});
