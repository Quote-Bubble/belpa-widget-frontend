import { describe, expect, it } from "vitest";

import {
  defaultAffectedAreaBox,
  updatePathCorner,
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

  it("moves only the dragged corner", () => {
    const path = defaultAffectedAreaBox({ lat: 51.7, lng: -2.2 });
    const moved = updatePathCorner(path, 1, { lat: 51.7002, lng: -2.1995 });
    expect(moved[1]).toEqual({ lat: 51.7002, lng: -2.1995 });
    expect(moved[0]).toEqual(path[0]);
    expect(moved[2]).toEqual(path[2]);
    expect(moved[3]).toEqual(path[3]);
  });
});
