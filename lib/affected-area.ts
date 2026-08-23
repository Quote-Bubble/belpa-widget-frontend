import type { LatLng } from "@/lib/types";

/** Default repair patch centred on the dropped pin (~5 m × 4 m at mid-latitudes). */
export function defaultAffectedAreaBox(
  center: LatLng,
  halfWidthM = 2.5,
  halfHeightM = 2,
): LatLng[] {
  const latStep = halfHeightM / 111_320;
  const lngStep = halfWidthM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return [
    { lat: center.lat + latStep, lng: center.lng - lngStep },
    { lat: center.lat + latStep, lng: center.lng + lngStep },
    { lat: center.lat - latStep, lng: center.lng + lngStep },
    { lat: center.lat - latStep, lng: center.lng - lngStep },
  ];
}

/** Read lat/lng from vis.gl or raw google drag events. */
export function readEventLatLng(event: unknown): LatLng | null {
  const e = event as {
    latLng?: unknown;
    detail?: { latLng?: unknown };
  };
  const raw = e?.latLng ?? e?.detail?.latLng;
  if (!raw) return null;
  const o = raw as {
    lat: number | (() => number);
    lng: number | (() => number);
  };
  const lat = typeof o.lat === "function" ? o.lat() : o.lat;
  const lng = typeof o.lng === "function" ? o.lng() : o.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

/**
 * Keep an axis-aligned rectangle when one corner is dragged.
 * Corners are ordered NW → NE → SE → SW (clockwise from north-west).
 */
export function updateRectCorner(
  path: LatLng[],
  cornerIndex: number,
  point: LatLng,
): LatLng[] {
  if (path.length !== 4) return path;
  const next = [...path] as [LatLng, LatLng, LatLng, LatLng];
  next[cornerIndex] = point;
  switch (cornerIndex) {
    case 0:
      next[1] = { lat: point.lat, lng: next[1].lng };
      next[3] = { lat: next[3].lat, lng: point.lng };
      break;
    case 1:
      next[0] = { lat: point.lat, lng: next[0].lng };
      next[2] = { lat: next[2].lat, lng: point.lng };
      break;
    case 2:
      next[1] = { lat: next[1].lat, lng: point.lng };
      next[3] = { lat: point.lat, lng: next[3].lng };
      break;
    case 3:
      next[0] = { lat: next[0].lat, lng: point.lng };
      next[2] = { lat: point.lat, lng: next[2].lng };
      break;
    default:
      break;
  }
  return next;
}
