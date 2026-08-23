"use client";

import {
  memo,
  useLayoutEffect,
  type MutableRefObject,
} from "react";
import { Marker, useMap } from "@vis.gl/react-google-maps";

import type { LatLng } from "@/lib/types";

/**
 * Mobile-friendly corner handles used by the roof outline editor and the
 * repair affected-area box. At rest: crosshair on the corner. On drag: a
 * lollipop under the thumb with the crosshair lifted clear of the finger.
 *
 * See DrawRoofStep for the full rationale on anchor swap + offsetByPixels.
 */

export const CORNER_BRAND = "#2f6bff";
export const PIN_LIFT = 48;
const BALL_R = 14;
const PIN_CANVAS = 2 * (PIN_LIFT + BALL_R + 5);
const TIP_CANVAS = 44;
const MAX_LIFT_FROM_VERTICAL = (60 * Math.PI) / 180;

export function polygonCentroid(path: LatLng[]): LatLng {
  const lat = path.reduce((sum, point) => sum + point.lat, 0) / path.length;
  const lng = path.reduce((sum, point) => sum + point.lng, 0) / path.length;
  return { lat, lng };
}

export function liftBearing(point: LatLng, centre: LatLng): number {
  const dx = (point.lng - centre.lng) * Math.cos((point.lat * Math.PI) / 180);
  const dy = point.lat - centre.lat;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return 0;
  const outward = Math.atan2(dx, dy);
  const upward =
    Math.cos(outward) < 0
      ? Math.sign(outward) * (Math.PI - Math.abs(outward))
      : outward;
  return (
    Math.sign(upward) * Math.min(Math.abs(upward), MAX_LIFT_FROM_VERTICAL)
  );
}

function crosshairMarkup(cx: number, cy: number, color: string): string {
  const t0 = 7;
  const t1 = 10.5;
  const ticks =
    `M ${cx - t1} ${cy} H ${cx - t0} M ${cx + t0} ${cy} H ${cx + t1} ` +
    `M ${cx} ${cy - t1} V ${cy - t0} M ${cx} ${cy + t0} V ${cy + t1}`;
  return (
    `<circle cx="${cx}" cy="${cy}" r="6.5" fill="#fff" fill-opacity="0.92"/>` +
    `<path d="${ticks}" stroke="#fff" stroke-width="3.4" stroke-opacity="0.85" stroke-linecap="round" fill="none"/>` +
    `<path d="${ticks}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" fill="none"/>` +
    `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="${color}" stroke-width="2.4"/>` +
    `<circle cx="${cx}" cy="${cy}" r="1.7" fill="${color}"/>`
  );
}

const pinIconCache: Record<string, google.maps.Icon> = {};
const tipIconCache: Record<string, google.maps.Icon> = {};

export function cornerGrabIcon(
  bearingRad: number,
  color: string = CORNER_BRAND,
): google.maps.Icon | undefined {
  if (typeof google === "undefined" || !google.maps) return undefined;
  const bucket = Math.round((bearingRad * 180) / Math.PI / 5) * 5;
  const key = `${color}:${bucket}`;
  const cached = pinIconCache[key];
  if (cached) return cached;

  const s = PIN_CANVAS;
  const c = s / 2;
  const rad = (bucket * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = -Math.cos(rad);
  const tx = c + ux * PIN_LIFT;
  const ty = c + uy * PIN_LIFT;
  const sx = c + ux * BALL_R;
  const sy = c + uy * BALL_R;
  const ex = c + ux * (PIN_LIFT - 12);
  const ey = c + uy * (PIN_LIFT - 12);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width="4" stroke-opacity="0.5" stroke-linecap="round"/>` +
    `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="4 3.5" stroke-linecap="round"/>` +
    `<circle cx="${c}" cy="${c}" r="${BALL_R}" fill="#fff" fill-opacity="0.7" stroke="${color}" stroke-opacity="0.75" stroke-width="2"/>` +
    `<circle cx="${c}" cy="${c}" r="${BALL_R - 5}" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="1.4" stroke-dasharray="3 2.5"/>` +
    crosshairMarkup(tx, ty, color) +
    `</svg>`;

  const icon: google.maps.Icon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(c, c),
    scaledSize: new google.maps.Size(s, s),
  };
  pinIconCache[key] = icon;
  return icon;
}

export function cornerTipIcon(
  color: string = CORNER_BRAND,
): google.maps.Icon | undefined {
  if (typeof google === "undefined" || !google.maps) return undefined;
  const cached = tipIconCache[color];
  if (cached) return cached;
  const c = TIP_CANVAS / 2;
  tipIconCache[color] = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${TIP_CANVAS}" height="${TIP_CANVAS}" viewBox="0 0 ${TIP_CANVAS} ${TIP_CANVAS}">` +
        crosshairMarkup(c, c, color) +
        `</svg>`,
    )}`,
    anchor: new google.maps.Point(c, c),
    scaledSize: new google.maps.Size(TIP_CANVAS, TIP_CANVAS),
  };
  return tipIconCache[color];
}

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

export function setMapPanLocked(
  map: google.maps.Map | null,
  locked: boolean,
) {
  if (!map) return;
  map.setOptions({
    gestureHandling: locked ? "none" : "greedy",
    draggable: !locked,
    keyboardShortcuts: !locked,
  });
}

export function MapPanLock({
  locked,
  mapRef,
}: {
  locked: boolean;
  mapRef: MutableRefObject<google.maps.Map | null>;
}) {
  const map = useMap();

  useLayoutEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  useLayoutEffect(() => {
    setMapPanLocked(map, locked);
  }, [map, locked]);

  return null;
}

type CornerMarkerProps = {
  position: LatLng;
  roofIndex: number;
  vertexIndex: number;
  draggable: boolean;
  clickable: boolean;
  zIndex: number;
  icon: google.maps.Icon | undefined;
  onCornerDragStart: (
    roofIndex: number,
    vertexIndex: number,
    point: LatLng,
  ) => void;
  onCornerDrag: (event: unknown) => void;
  onCornerDragEnd: (
    event: unknown,
    roofIndex: number,
    vertexIndex: number,
  ) => void;
};

/** Memoised so mid-drag polygon updates do not fight Google's native drag. */
export const CornerMarker = memo(function CornerMarker({
  position,
  roofIndex,
  vertexIndex,
  draggable,
  clickable,
  zIndex,
  icon,
  onCornerDragStart,
  onCornerDrag,
  onCornerDragEnd,
}: CornerMarkerProps) {
  return (
    <Marker
      position={position}
      draggable={draggable}
      clickable={clickable}
      zIndex={zIndex}
      icon={icon}
      onDragStart={() => onCornerDragStart(roofIndex, vertexIndex, position)}
      onDrag={(event) => onCornerDrag(event)}
      onDragEnd={(event) => onCornerDragEnd(event, roofIndex, vertexIndex)}
    />
  );
});
