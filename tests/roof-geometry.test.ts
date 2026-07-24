import { describe, expect, it } from "vitest";

import {
  deriveRoofType,
  isSimpleRing,
  measureBoundary,
  measureDetached,
  pathFromBounds,
  ringsOverlapExcessively,
  selectBoundsShare,
} from "@/lib/roof-geometry";
import type { GeoBounds, LatLng, RoofSegment, SolarScan } from "@/lib/types";

const BUILDING: GeoBounds = {
  north: 52.0002,
  south: 52,
  east: 0.0004,
  west: 0,
};

function segment(
  boundingBox: GeoBounds,
  groundAreaMeters2: number,
  pitchDegrees = 0,
  azimuthDegrees = 90,
): RoofSegment {
  const multiplier = 1 / Math.cos((pitchDegrees * Math.PI) / 180);
  return {
    pitchDegrees,
    azimuthDegrees,
    groundAreaMeters2,
    areaMeters2: groundAreaMeters2 * multiplier,
    boundingBox,
  };
}

function scanWithSegments(
  segments: RoofSegment[],
  wholeArea: number,
  wholeGroundArea: number,
): SolarScan {
  return {
    center: { lat: 52.0001, lng: 0.0002 },
    boundingBox: BUILDING,
    imageryQuality: "HIGH",
    imageryDate: "2026-01-01",
    wholeRoofStats: {
      areaMeters2: wholeArea,
      groundAreaMeters2: wholeGroundArea,
    },
    roofSegmentStats: segments,
  };
}

describe("roof boundary measurement", () => {
  const leftBounds: GeoBounds = { ...BUILDING, east: 0.0002 };
  const rightBounds: GeoBounds = { ...BUILDING, west: 0.0002 };
  const flatScan = scanWithSegments(
    [segment(leftBounds, 50, 0, 90), segment(rightBounds, 50, 0, 270)],
    100,
    100,
  );

  it("reconciles a full building selection to Solar whole-roof area", () => {
    const result = measureBoundary(flatScan, pathFromBounds(BUILDING));

    expect(result.surfaceAreaM2).toBeCloseTo(100, 5);
    expect(result.groundAreaM2).toBeCloseTo(100, 5);
    expect(result.surfaceCalibrationFactor).toBeCloseTo(1, 5);
    expect(result.intersectedSegments).toBe(2);
  });

  it("changes area when only half the roof is selected", () => {
    const full = measureBoundary(flatScan, pathFromBounds(BUILDING));
    const half = measureBoundary(flatScan, pathFromBounds(leftBounds));

    expect(half.surfaceAreaM2).toBeCloseTo(50, 4);
    expect(half.surfaceAreaM2).toBeCloseTo(full.surfaceAreaM2 / 2, 4);
    expect(half.contributions).toHaveLength(1);
  });

  it("applies the pitch multiplier after clipping ground area", () => {
    const pitchedScan = scanWithSegments(
      [segment(BUILDING, 100, 60, 180)],
      200,
      100,
    );
    const halfBounds: GeoBounds = { ...BUILDING, east: 0.0002 };
    const result = measureBoundary(pitchedScan, pathFromBounds(halfBounds));

    expect(result.groundAreaM2).toBeCloseTo(50, 3);
    expect(result.contributions[0].pitchMultiplier).toBeCloseTo(2, 5);
    expect(result.surfaceAreaM2).toBeCloseTo(100, 3);
  });

  it("rejects a polygon that does not overlap the roof", () => {
    const outside: GeoBounds = {
      north: 53.0002,
      south: 53,
      east: 1.0004,
      west: 1,
    };
    expect(() =>
      measureBoundary(flatScan, pathFromBounds(outside)),
    ).toThrow(/overlaps the roof/i);
  });

  it("uses Google's exact whole-roof surface for detached properties", () => {
    const deliberatelyDifferent = scanWithSegments(
      [segment(BUILDING, 90, 30)],
      120,
      90,
    );
    const result = measureDetached(deliberatelyDifferent);

    expect(result.surfaceAreaM2).toBe(120);
    expect(result.groundAreaM2).toBe(90);
    expect(result.method).toBe("solar_whole_roof");
  });
});

describe("direct boundary selection", () => {
  it("splits the long building axis without property assumptions", () => {
    const firstHalf = selectBoundsShare(BUILDING, 2, 0);
    const secondHalf = selectBoundsShare(BUILDING, 2, 1);

    expect(firstHalf[1].lng).toBeCloseTo(0.0002, 8);
    expect(secondHalf[0].lng).toBeCloseTo(0.0002, 8);
    expect(secondHalf[1].lng).toBeCloseTo(BUILDING.east, 8);
  });

  it("derives hip, flat and gable from segment pitch and azimuth", () => {
    const bounds = BUILDING;
    expect(
      deriveRoofType([
        segment(bounds, 10, 30, 0),
        segment(bounds, 10, 30, 100),
        segment(bounds, 10, 30, 220),
      ]),
    ).toBe("hip");
    expect(deriveRoofType([segment(bounds, 10, 10, 0)])).toBe("flat");
    expect(
      deriveRoofType([
        segment(bounds, 10, 30, 0),
        segment(bounds, 10, 30, 180),
      ]),
    ).toBe("gable");
  });
});

describe("isSimpleRing", () => {
  it("accepts a simple rectangle", () => {
    expect(isSimpleRing(pathFromBounds(BUILDING))).toBe(true);
  });

  it("rejects a self-crossing bow-tie", () => {
    const bowTie: LatLng[] = [
      { lat: 52, lng: 0 },
      { lat: 52.001, lng: 0.001 },
      { lat: 52, lng: 0.001 },
      { lat: 52.001, lng: 0 },
    ];
    expect(isSimpleRing(bowTie)).toBe(false);
  });
});

describe("ringsOverlapExcessively", () => {
  it("flags near-identical overlapping outlines", () => {
    const a = pathFromBounds(BUILDING);
    const b = pathFromBounds({
      ...BUILDING,
      east: BUILDING.east - 0.00001,
    });
    expect(ringsOverlapExcessively(a, b)).toBe(true);
  });

  it("allows side-by-side non-overlapping halves", () => {
    const left = pathFromBounds({ ...BUILDING, east: 0.0002 });
    const right = pathFromBounds({ ...BUILDING, west: 0.0002 });
    expect(ringsOverlapExcessively(left, right)).toBe(false);
  });
});
