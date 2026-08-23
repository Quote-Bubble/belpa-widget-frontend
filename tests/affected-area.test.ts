import { describe, expect, it } from "vitest";

import {
  defaultAffectedAreaBox,
  updateRectCorner,
} from "@/lib/affected-area";

describe("affected area helpers", () => {
  it("builds a default box around the pin", () => {
    const center = { lat: 51.7, lng: -2.2 };
    const box = defaultAffectedAreaBox(center);
    expect(box).toHaveLength(4);
    const lats = box.map((point) => point.lat);
    const lngs = box.map((point) => point.lng);
    expect(Math.max(...lats)).toBeGreaterThan(center.lat);
    expect(Math.min(...lats)).toBeLessThan(center.lat);
    expect(Math.max(...lngs)).toBeGreaterThan(center.lng);
    expect(Math.min(...lngs)).toBeLessThan(center.lng);
  });

  it("keeps a rectangle axis-aligned when a corner moves", () => {
    const path = defaultAffectedAreaBox({ lat: 51.7, lng: -2.2 });
    const moved = updateRectCorner(path, 1, { lat: 51.7002, lng: -2.1995 });
    expect(moved[0].lat).toBeCloseTo(51.7002, 4);
    expect(moved[2].lng).toBeCloseTo(-2.1995, 4);
    expect(moved[0].lng).toBe(path[0].lng);
    expect(moved[2].lat).toBe(path[2].lat);
  });
});
