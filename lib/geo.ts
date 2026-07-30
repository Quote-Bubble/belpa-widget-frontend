import type { GeoBounds, LatLng } from "@/lib/types";

const EARTH_RADIUS_M = 6_371_000;

function toRad(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in metres between two WGS84 points. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sum of consecutive segment lengths along an open or closed path. */
export function pathLengthM(path: LatLng[]): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += haversineM(path[i], path[i + 1]);
  }
  return total;
}

/** Closed-ring perimeter (last edge connects back to the first point). */
export function polygonPerimeterM(path: LatLng[]): number {
  if (path.length < 2) return 0;
  return pathLengthM(path) + haversineM(path[path.length - 1], path[0]);
}

/** Length of the edge from path[i] to path[(i+1) % n]. */
export function edgeLengthM(path: LatLng[], edgeIndex: number): number {
  if (path.length < 2) return 0;
  const i = ((edgeIndex % path.length) + path.length) % path.length;
  const next = (i + 1) % path.length;
  return haversineM(path[i], path[next]);
}

/** Approximate plan area of an axis-aligned geographic bounds box (m²). */
export function boundsAreaM2(bounds: GeoBounds): number {
  const midLat = (bounds.north + bounds.south) / 2;
  const heightM = Math.abs(bounds.north - bounds.south) * 111_320;
  const widthM =
    Math.abs(bounds.east - bounds.west) *
    111_320 *
    Math.cos(toRad(midLat));
  return Math.max(0, heightM * widthM);
}

/**
 * Approximate ground metres per screen pixel at a given latitude and zoom,
 * matching the Web Mercator formula used by Google Maps.
 */
export function metersPerPixel(lat: number, zoom: number): number {
  return (
    (156_543.03392 * Math.cos(toRad(lat))) / Math.pow(2, Math.max(0, zoom))
  );
}

export function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/**
 * Shift a point by a screen-pixel distance along a screen bearing (0 = up/north,
 * increasing clockwise, so π/2 = right/east).
 *
 * Used to convert a marker icon's fixed pixel offset into real coordinates: the
 * roof-corner handle draws its crosshair a constant number of pixels from the
 * grab ball, so committing the corner means resolving that same offset back into
 * a LatLng at the current zoom.
 */
export function offsetByPixels(
  from: LatLng,
  bearingRad: number,
  pixels: number,
  zoom: number,
): LatLng {
  const mPerPx = metersPerPixel(from.lat, zoom);
  const northM = Math.cos(bearingRad) * pixels * mPerPx;
  const eastM = Math.sin(bearingRad) * pixels * mPerPx;
  const cosLat = Math.cos(toRad(from.lat));
  return {
    lat: from.lat + northM / 111_320,
    // Guard the pole singularity — cos(lat) → 0 would blow the longitude up.
    lng:
      Math.abs(cosLat) < 1e-9
        ? from.lng
        : from.lng + eastM / (111_320 * cosLat),
  };
}
