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

/** Move one corner only — neighbours stay put so the patch can become a free quad. */
export function updatePathCorner(
  path: LatLng[],
  cornerIndex: number,
  point: LatLng,
): LatLng[] {
  if (cornerIndex < 0 || cornerIndex >= path.length) return path;
  const next = path.slice();
  next[cornerIndex] = point;
  return next;
}
