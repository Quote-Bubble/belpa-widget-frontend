import { describe, expect, it } from "vitest";

import {
  boundsAreaM2,
  edgeLengthM,
  haversineM,
  metersPerPixel,
  offsetByPixels,
  pathLengthM,
  polygonPerimeterM,
} from "@/lib/geo";

describe("haversineM", () => {
  it("returns ~0 for identical points", () => {
    expect(haversineM({ lat: 51.5, lng: -0.12 }, { lat: 51.5, lng: -0.12 })).toBe(0);
  });

  it("matches a known London distance within a few metres", () => {
    // Roughly 1 km east along the equator-adjusted latitude near London
    const a = { lat: 51.5, lng: -0.12 };
    const b = { lat: 51.5, lng: -0.1055 };
    const dist = haversineM(a, b);
    expect(dist).toBeGreaterThan(950);
    expect(dist).toBeLessThan(1100);
  });
});

describe("path and perimeter", () => {
  const square = [
    { lat: 52, lng: 0 },
    { lat: 52, lng: 0.001 },
    { lat: 51.999, lng: 0.001 },
    { lat: 51.999, lng: 0 },
  ];

  it("sums open path edges", () => {
    expect(pathLengthM(square.slice(0, 2))).toBeCloseTo(
      haversineM(square[0], square[1]),
      6,
    );
  });

  it("closes the ring for perimeter", () => {
    const open = pathLengthM(square);
    const closed = polygonPerimeterM(square);
    expect(closed).toBeGreaterThan(open);
    expect(closed).toBeCloseTo(
      open + haversineM(square[3], square[0]),
      6,
    );
  });

  it("reads edge length by index with wrap-around", () => {
    expect(edgeLengthM(square, 3)).toBeCloseTo(
      haversineM(square[3], square[0]),
      6,
    );
  });
});

describe("boundsAreaM2", () => {
  it("returns a positive area for a small box", () => {
    const area = boundsAreaM2({
      north: 52.001,
      south: 52,
      east: 0.001,
      west: 0,
    });
    expect(area).toBeGreaterThan(5_000);
    expect(area).toBeLessThan(15_000);
  });
});

describe("metersPerPixel", () => {
  it("shrinks as zoom increases", () => {
    expect(metersPerPixel(51.5, 20)).toBeLessThan(metersPerPixel(51.5, 18));
  });
});

describe("offsetByPixels", () => {
  const origin = { lat: 51.5, lng: -0.12 };
  const zoom = 20;

  it("moves north for bearing 0 and south for bearing pi", () => {
    expect(offsetByPixels(origin, 0, 48, zoom).lat).toBeGreaterThan(origin.lat);
    expect(offsetByPixels(origin, Math.PI, 48, zoom).lat).toBeLessThan(
      origin.lat,
    );
  });

  it("moves east for bearing pi/2 and west for -pi/2", () => {
    expect(offsetByPixels(origin, Math.PI / 2, 48, zoom).lng).toBeGreaterThan(
      origin.lng,
    );
    expect(offsetByPixels(origin, -Math.PI / 2, 48, zoom).lng).toBeLessThan(
      origin.lng,
    );
  });

  it("keeps the requested pixel distance on the ground", () => {
    const moved = offsetByPixels(origin, 0, 48, zoom);
    const expectedM = 48 * metersPerPixel(origin.lat, zoom);
    expect(haversineM(origin, moved)).toBeCloseTo(expectedM, 0);
  });

  it("covers less ground as zoom increases", () => {
    const near = haversineM(origin, offsetByPixels(origin, 0, 48, 21));
    const far = haversineM(origin, offsetByPixels(origin, 0, 48, 18));
    expect(near).toBeLessThan(far);
  });

  it("round-trips: offsetting back by the opposite bearing returns the origin", () => {
    const out = offsetByPixels(origin, Math.PI / 3, 48, zoom);
    const back = offsetByPixels(out, Math.PI / 3 + Math.PI, 48, zoom);
    expect(back.lat).toBeCloseTo(origin.lat, 6);
    expect(back.lng).toBeCloseTo(origin.lng, 6);
  });

  it("is a no-op on longitude at the pole rather than exploding", () => {
    const polar = offsetByPixels({ lat: 90, lng: 10 }, Math.PI / 2, 48, zoom);
    expect(Number.isFinite(polar.lng)).toBe(true);
    expect(polar.lng).toBe(10);
  });
});
