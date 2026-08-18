"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Map,
  Marker,
  Polygon,
  Polyline,
  Rectangle,
} from "@vis.gl/react-google-maps";
import type {
  MapCameraChangedEvent,
  MapMouseEvent,
} from "@vis.gl/react-google-maps";

import {
  ContinueBubble,
  PrimaryButton,
  StepHeading,
  StepShell,
  useFlowVariant,
  useMapHeightClass,
} from "@/components/quote/ui";
import { emptyDrawnRoof, type CombinedMeasurement } from "@/lib/quote-flow";
import {
  haversineM,
  metersPerPixel,
  midpoint,
  offsetByPixels,
  SATELLITE_MAX_ZOOM,
  SATELLITE_MIN_ZOOM,
} from "@/lib/geo";
import { isSimpleRing, ringsOverlapExcessively } from "@/lib/roof-geometry";
import type {
  DrawnRoof,
  LatLng,
  RoofObstructionKind,
  SolarScan,
} from "@/lib/types";

const BRAND = "#2f6bff";
const GUTTER = "#f59e0b";
const CHIMNEY = "#ef4444";
const ROOFLIGHT = "#06b6d4";
const CIRCLE_PATH = "M -7 0 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0";
const TICK_CIRCLE_PATH = "M -13 0 a 13 13 0 1 0 26 0 a 13 13 0 1 0 -26 0";
const SHARE_CIRCLE_PATH = "M -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0";
const SNAP_PX = 12;
const CLOSE_M = 0.8;

/**
 * Corner handles.
 *
 * At rest a corner is just a crosshair — no handle, nothing to decode. You grab
 * the corner itself; the handle materialises under your thumb on drag-start and
 * the corner lifts clear so you can see where you're putting it.
 *
 * The trick is which part of the artwork the icon is ANCHORED to, because the
 * anchor is what sits on the marker's LatLng:
 *
 *   at rest    anchor = crosshair  → the crosshair is the corner, honestly placed
 *   dragging   anchor = grab ball  → the ball tracks your thumb, and the
 *                                    crosshair renders PIN_LIFT px away from it
 *
 * Swapping between them mid-drag is what produces the small outward hop of the
 * corner at the moment you grab it: the LatLng doesn't move, but the pixel of
 * artwork pinned to it does. Because the marker's position is now the *ball*,
 * committing the corner means resolving that pixel offset back into coordinates
 * (offsetByPixels) — the drag reports where the ball ended up, not the corner.
 *
 * A plain tap never triggers this: Google only fires dragstart once the pointer
 * actually moves, so pressing a corner without dragging leaves it exactly alone.
 */
const PIN_LIFT = 48;
const BALL_R = 14;
const PIN_CANVAS = 2 * (PIN_LIFT + BALL_R + 5); // ball dead centre, tip anywhere
// 44px so the resting crosshair clears the minimum touch target — you now grab
// the corner directly, so this tap area is the whole interaction.
const TIP_CANVAS = 44;
/** Never let the lift go more horizontal than this, or a thumb still covers the
 *  corner. cos(60°) = 0.5, so at least half of PIN_LIFT is always upward. */
const MAX_LIFT_FROM_VERTICAL = (60 * Math.PI) / 180;

/**
 * Which way the corner hops when you grab it, as a screen bearing (0 = up/north,
 * clockwise, so π/2 = right).
 *
 * Leans away from the face centre, so the corner moves off the roof rather than
 * further onto it — but always upward, because a thumb occludes from below and a
 * strictly outward lift would send the bottom corners straight into it. Downward
 * bearings are mirrored into the upper half, keeping their horizontal lean.
 */
function liftBearing(point: LatLng, centre: LatLng): number {
  const dx = (point.lng - centre.lng) * Math.cos((point.lat * Math.PI) / 180);
  const dy = point.lat - centre.lat;
  // Vertex sitting on the centroid (degenerate face): straight up.
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return 0;
  const outward = Math.atan2(dx, dy);
  // Mirror the lower half upward: 135° (down-right) → 45° (up-right).
  const upward =
    Math.cos(outward) < 0
      ? Math.sign(outward) * (Math.PI - Math.abs(outward))
      : outward;
  return (
    Math.sign(upward) *
    Math.min(Math.abs(upward), MAX_LIFT_FROM_VERTICAL)
  );
}

/** The corner point itself. A crosshair reads as "this exact spot" in a way a
 *  filled dot does not, and the white underlay keeps it legible over both pale
 *  roofs and shadow. */
function crosshairMarkup(cx: number, cy: number): string {
  const t0 = 7;
  const t1 = 10.5;
  const ticks =
    `M ${cx - t1} ${cy} H ${cx - t0} M ${cx + t0} ${cy} H ${cx + t1} ` +
    `M ${cx} ${cy - t1} V ${cy - t0} M ${cx} ${cy + t0} V ${cy + t1}`;
  return (
    `<circle cx="${cx}" cy="${cy}" r="6.5" fill="#fff" fill-opacity="0.92"/>` +
    `<path d="${ticks}" stroke="#fff" stroke-width="3.4" stroke-opacity="0.85" stroke-linecap="round" fill="none"/>` +
    `<path d="${ticks}" stroke="${BRAND}" stroke-width="1.8" stroke-linecap="round" fill="none"/>` +
    `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="${BRAND}" stroke-width="2.4"/>` +
    `<circle cx="${cx}" cy="${cy}" r="1.7" fill="${BRAND}"/>`
  );
}

// vis.gl calls marker.setIcon() whenever the icon prop's identity changes, and
// doing that mid-drag can jar the captured grab offset. Cache by 5° bucket so
// re-renders (and the dragstart re-render in particular) reuse one object.
// A plain record, not a Map — `Map` is vis.gl's component import in this file.
const pinIconCache: Record<number, google.maps.Icon> = {};
let tipIconCache: google.maps.Icon | undefined;

/**
 * The dragging handle. ANCHORED ON THE BALL (canvas centre), which is what makes
 * the ball follow your thumb; the crosshair is drawn PIN_LIFT px along
 * `bearingRad` from it, which is where the corner actually goes.
 */
function cornerGrabIcon(bearingRad: number): google.maps.Icon | undefined {
  if (typeof google === "undefined" || !google.maps) return undefined;
  const bucket = Math.round((bearingRad * 180) / Math.PI / 5) * 5;
  const cached = pinIconCache[bucket];
  if (cached) return cached;

  const s = PIN_CANVAS;
  const c = s / 2;
  const rad = (bucket * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = -Math.cos(rad);
  const tx = c + ux * PIN_LIFT;
  const ty = c + uy * PIN_LIFT;
  // Tether stops clear of both ends so it reads as "grip → point" rather than
  // one solid lollipop with two ambiguous ends.
  const sx = c + ux * BALL_R;
  const sy = c + uy * BALL_R;
  const ex = c + ux * (PIN_LIFT - 12);
  const ey = c + uy * (PIN_LIFT - 12);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width="4" stroke-opacity="0.5" stroke-linecap="round"/>` +
    `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${BRAND}" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="4 3.5" stroke-linecap="round"/>` +
    // Translucent, knurled ball: obviously a grip, and see-through because your
    // thumb is on it anyway. A solid centre dot read as a second candidate
    // "point", which was half the which-end-is-it confusion.
    `<circle cx="${c}" cy="${c}" r="${BALL_R}" fill="#fff" fill-opacity="0.7" stroke="${BRAND}" stroke-opacity="0.75" stroke-width="2"/>` +
    `<circle cx="${c}" cy="${c}" r="${BALL_R - 5}" fill="none" stroke="${BRAND}" stroke-opacity="0.45" stroke-width="1.4" stroke-dasharray="3 2.5"/>` +
    // Crosshair last so it always sits above the tether.
    crosshairMarkup(tx, ty) +
    `</svg>`;

  const icon: google.maps.Icon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(c, c),
    scaledSize: new google.maps.Size(s, s),
  };
  pinIconCache[bucket] = icon;
  return icon;
}

/** The resting corner: a bare crosshair, anchored on itself. This is what you
 *  grab — there is no handle until you start moving. */
function cornerTipIcon(): google.maps.Icon | undefined {
  if (typeof google === "undefined" || !google.maps) return undefined;
  if (tipIconCache) return tipIconCache;
  const c = TIP_CANVAS / 2;
  tipIconCache = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${TIP_CANVAS}" height="${TIP_CANVAS}" viewBox="0 0 ${TIP_CANVAS} ${TIP_CANVAS}">` +
        crosshairMarkup(c, c) +
        `</svg>`,
    )}`,
    anchor: new google.maps.Point(c, c),
    scaledSize: new google.maps.Size(TIP_CANVAS, TIP_CANVAS),
  };
  return tipIconCache;
}

/**
 * One editable corner handle, memoised.
 *
 * The whole point of the memo is drag smoothness. Every `onDrag` frame the
 * parent calls setState (to rubber-band the polygon), which re-renders the map
 * subtree. vis.gl's <Marker> re-applies *all* options on every render —
 * `marker.setOptions({ position, ... })` — with no draggable guard, so a plain
 * re-render mid-drag re-sets the marker's position to its resting corner while
 * Google is mid-drag moving it under the thumb. The two fight frame-by-frame
 * and the lollipop jitters. Skipping the marker's re-render (props are
 * referentially stable during a drag — position, icon and the callbacks below
 * never change until release) leaves Google's native drag uncontested, so the
 * ball tracks the thumb cleanly while the polygon still rubber-bands.
 */
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

const CornerMarker = memo(function CornerMarker({
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

// Marker drag events can arrive as a raw google event (`.latLng` with lat()/lng()
// methods) or a vis.gl-wrapped one (`.detail.latLng`); coords may be methods or
// literals. Read defensively so it works across the library's shapes.
function readEventLatLng(event: unknown): LatLng | null {
  const e = event as {
    latLng?: unknown;
    detail?: { latLng?: unknown };
  };
  const raw = e?.latLng ?? e?.detail?.latLng;
  if (!raw) return null;
  const o = raw as { lat: number | (() => number); lng: number | (() => number) };
  const lat = typeof o.lat === "function" ? o.lat() : o.lat;
  const lng = typeof o.lng === "function" ? o.lng() : o.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}
const BLUE_DOT_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 14 14\'%3E%3Ccircle cx=\'7\' cy=\'7\' r=\'4\' fill=\'%232f6bff\' stroke=\'white\' stroke-width=\'2\'/%3E%3C/svg%3E") 7 7, crosshair';

export type DrawMode = "roof" | "roofline";
/** faces = outline editor; gutters = mark runs; obstructions = chimney/rooflight */
type Phase = "faces" | "gutters" | "obstructions";
type ObstructionDraft = {
  kind: RoofObstructionKind;
  first: LatLng | null;
  adjacent: LatLng | null;
  preview: LatLng[] | null;
};

function rectangleFromThreeCorners(first: LatLng, adjacent: LatLng, opposite: LatLng) {
  const fourth = {
    lat: first.lat + opposite.lat - adjacent.lat,
    lng: first.lng + opposite.lng - adjacent.lng,
  };
  const path = [first, adjacent, opposite, fourth];
  return {
    path,
    bounds: path.reduce(
      (bounds, point) => ({
        north: Math.max(bounds.north, point.lat),
        south: Math.min(bounds.south, point.lat),
        east: Math.max(bounds.east, point.lng),
        west: Math.min(bounds.west, point.lng),
      }),
      {
        north: Number.NEGATIVE_INFINITY,
        south: Number.POSITIVE_INFINITY,
        east: Number.NEGATIVE_INFINITY,
        west: Number.POSITIVE_INFINITY,
      },
    ),
  };
}

function polygonCentroid(path: LatLng[]): LatLng {
  const lat = path.reduce((sum, point) => sum + point.lat, 0) / path.length;
  const lng = path.reduce((sum, point) => sum + point.lng, 0) / path.length;
  return { lat, lng };
}

/** Water-flow arrow: from roof interior toward the gutter edge. */
function flowArrow(path: LatLng[], edgeIndex: number): { from: LatLng; to: LatLng } {
  const a = path[edgeIndex];
  const b = path[(edgeIndex + 1) % path.length];
  const to = midpoint(a, b);
  const centroid = polygonCentroid(path);
  const dLat = centroid.lat - to.lat;
  const dLng = centroid.lng - to.lng;
  const len = Math.hypot(dLat, dLng) || 1;
  const reach = Math.max(haversineM(a, b) * 0.35, 2.5);
  // Convert ~metres to degrees at this latitude
  const latStep = reach / 111_320;
  const lngStep = reach / (111_320 * Math.cos((to.lat * Math.PI) / 180));
  const from = {
    lat: to.lat + (dLat / len) * latStep,
    lng: to.lng + (dLng / len) * lngStep,
  };
  return { from, to };
}

function allVertices(roofs: DrawnRoof[], draft: LatLng[]): LatLng[] {
  const points: LatLng[] = [];
  for (const roof of roofs) {
    for (const point of roof.path) points.push(point);
  }
  if (draft.length > 0) points.push(draft[0]);
  return points;
}

function findSnap(
  click: LatLng,
  candidates: LatLng[],
  zoom: number,
): LatLng | null {
  const thresholdM = metersPerPixel(click.lat, zoom) * SNAP_PX;
  let best: LatLng | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dist = haversineM(click, candidate);
    if (dist < thresholdM && dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function GutterEdge({
  path,
  edgeIndex,
  marked,
  onToggle,
}: {
  path: LatLng[];
  edgeIndex: number;
  marked: boolean;
  onToggle: () => void;
}) {
  const a = path[edgeIndex];
  const b = path[(edgeIndex + 1) % path.length];
  const mid = midpoint(a, b);
  const arrow = marked ? flowArrow(path, edgeIndex) : null;

  return (
    <>
      <Polyline
        path={[a, b]}
        geodesic
        strokeColor={marked ? GUTTER : "#ffffff"}
        strokeOpacity={marked ? 0.95 : 0.01}
        strokeWeight={marked ? 5 : 18}
        zIndex={marked ? 12 : 6}
        onClick={onToggle}
      />
      {marked && arrow ? (
        <>
          <Polyline
            path={[arrow.from, arrow.to]}
            geodesic
            clickable={false}
            strokeColor={GUTTER}
            strokeOpacity={0.9}
            strokeWeight={2.5}
            zIndex={14}
            icons={[
              {
                icon: {
                  path: "M 0,-1.2 L 2.4,0 L 0,1.2 Z",
                  fillColor: GUTTER,
                  fillOpacity: 1,
                  strokeWeight: 0,
                  scale: 3.2,
                },
                offset: "100%",
              },
            ]}
          />
          <Marker
            position={mid}
            clickable={false}
            zIndex={15}
            label={{
              text: "GUTTER",
              color: "#ffffff",
              fontWeight: "700",
              fontSize: "10px",
            }}
            icon={{
              path: "M -22 -8 h 44 v 16 h -44 z",
              fillColor: GUTTER,
              fillOpacity: 0.95,
              strokeWeight: 0,
              scale: 1,
            }}
          />
        </>
      ) : null}
    </>
  );
}

export function DrawCanvas({
  scan,
  roofs,
  measurementAreaM2,
  mode,
  phase,
  onRoofsChange,
  onPhaseChange,
  startDrawingToken,
  resetToken,
  onStartDrawing,
  onReset,
  onContinue,
  ready,
  mapView,
  onMapViewChange,
}: {
  scan: SolarScan;
  roofs: DrawnRoof[];
  measurementAreaM2: number | null;
  mode: DrawMode;
  phase: Phase;
  onRoofsChange: (roofs: DrawnRoof[]) => void;
  onPhaseChange: (phase: Phase) => void;
  startDrawingToken: number;
  resetToken: number;
  onStartDrawing: () => void;
  onReset: () => void;
  onContinue: () => void;
  ready: boolean;
  mapView: { center: LatLng; zoom: number } | null;
  onMapViewChange: (view: { center: LatLng; zoom: number }) => void;
}) {
  const variant = useFlowVariant();
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [drawing, setDrawing] = useState(roofs.length === 0);
  const [cursor, setCursor] = useState<LatLng | null>(null);
  const [zoom, setZoom] = useState(
    mapView ? Math.min(mapView.zoom, SATELLITE_MAX_ZOOM) : 19,
  );
  const [activeRoofIndex, setActiveRoofIndex] = useState<number | null>(
    roofs.length > 0 ? roofs.length - 1 : null,
  );
  const [obstructionDraft, setObstructionDraft] =
    useState<ObstructionDraft | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  // The live corner drag. `bearing` is frozen at drag-start: recomputing it as
  // the corner moves would rotate the icon mid-drag (and so re-set it, which can
  // jar the drag) and would move the goalposts on where the corner ends up.
  // `preview` is the corner's would-be position, for drawing only — the roof
  // state itself isn't touched until release.
  const [dragCorner, setDragCorner] = useState<{
    roofIndex: number;
    vertexIndex: number;
    bearing: number;
    preview: LatLng | null;
  } | null>(null);
  // Drag handlers fire from Google listeners, so read the session off a ref
  // rather than trusting the closure they were created in.
  const dragSessionRef = useRef<{ bearing: number; zoom: number } | null>(null);
  const mapHeight = useMapHeightClass();

  useEffect(() => {
    if (startDrawingToken === 0) return;
    setDraft([]);
    setCursor(null);
    setObstructionDraft(null);
    setDrawing(true);
    onPhaseChange("faces");
  }, [startDrawingToken, onPhaseChange]);

  useEffect(() => {
    if (resetToken === 0) return;
    setDraft([]);
    setCursor(null);
    setActiveRoofIndex(null);
    setObstructionDraft(null);
    setDrawing(true);
    onPhaseChange("faces");
  }, [resetToken, onPhaseChange]);

  const canClose = draft.length >= 3;
  const sharedVertices = allVertices(roofs, draft);
  const inFaces = phase === "faces";
  const inGutters = phase === "gutters";
  const inObstructions = phase === "obstructions";

  function updateRoof(index: number, next: DrawnRoof) {
    const copy = roofs.slice();
    copy[index] = next;
    onRoofsChange(copy);
  }

  // Whole-polygon drag ("move the box over the roof") is captured off the live
  // google.maps.Polygon on `dragend`, not via onPathsChanged — dragging the
  // polygon body doesn't fire the per-vertex path events onPathsChanged relies
  // on, so without this the box would snap back after a move. A roofsRef keeps
  // the listener reading current state (it's attached once, on mount).
  const roofsRef = useRef(roofs);
  roofsRef.current = roofs;
  // NB: `Map` is the vis.gl component in this file, so use a plain record.
  const polyListeners = useRef<
    Record<string, google.maps.MapsEventListener>
  >({});
  function registerRoofPoly(id: string, poly: google.maps.Polygon | null) {
    const listeners = polyListeners.current;
    if (!poly) {
      listeners[id]?.remove();
      delete listeners[id];
      return;
    }
    if (listeners[id]) return;
    listeners[id] = poly.addListener("dragend", () => {
      const path = poly
        .getPath()
        .getArray()
        .map((ll) => ({ lat: ll.lat(), lng: ll.lng() }));
      if (path.length < 3) return;
      const current = roofsRef.current;
      const index = current.findIndex((roof) => roof.id === id);
      if (index < 0) return;
      const next = current.slice();
      next[index] = { ...current[index], path };
      onRoofsChange(next);
    });
  }

  /** The face as it should be drawn right now: mid-drag the grabbed corner is
   *  substituted with its preview so the outline follows the crosshair instead of
   *  snapping only on release. */
  function previewPath(roof: DrawnRoof, roofIndex: number): LatLng[] {
    if (
      !dragCorner ||
      dragCorner.roofIndex !== roofIndex ||
      !dragCorner.preview
    ) {
      return roof.path;
    }
    const path = roof.path.slice();
    path[dragCorner.vertexIndex] = dragCorner.preview;
    return path;
  }

  // Corner-drag handlers are stable (useCallback with no deps) so the memoised
  // CornerMarker never re-renders mid-drag — see CornerMarker for why that's
  // what stops the jitter. They read live values off refs, never a render
  // snapshot: zoom and onRoofsChange as refs, roofs via the existing roofsRef.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onRoofsChangeRef = useRef(onRoofsChange);
  onRoofsChangeRef.current = onRoofsChange;

  // Grab-start: freeze the lift bearing and zoom for the drag, then swap the
  // corner's icon to the grab lollipop. Google only fires this once the pointer
  // actually moves, so a plain tap leaves the corner alone.
  const handleCornerDragStart = useCallback(
    (roofIndex: number, vertexIndex: number, point: LatLng) => {
      const roof = roofsRef.current[roofIndex];
      if (!roof) return;
      const bearing = liftBearing(point, polygonCentroid(roof.path));
      dragSessionRef.current = { bearing, zoom: zoomRef.current };
      setDragCorner({ roofIndex, vertexIndex, bearing, preview: null });
    },
    [],
  );

  // Per-frame: the drag reports where the BALL is; the corner is PIN_LIFT px
  // along the frozen bearing from it. Only the polygon preview reads this.
  const handleCornerDrag = useCallback((event: unknown) => {
    const session = dragSessionRef.current;
    const ball = readEventLatLng(event);
    if (!session || !ball) return;
    const corner = offsetByPixels(ball, session.bearing, PIN_LIFT, session.zoom);
    setDragCorner((current) =>
      current ? { ...current, preview: corner } : current,
    );
  }, []);

  // Release: commit the resolved corner into roofs. Reads roofsRef so it never
  // writes from a stale snapshot.
  const handleCornerDragEnd = useCallback(
    (event: unknown, roofIndex: number, vertexIndex: number) => {
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      setDragCorner(null);
      const ball = readEventLatLng(event);
      if (!session || !ball) return;
      const next = offsetByPixels(ball, session.bearing, PIN_LIFT, session.zoom);
      const current = roofsRef.current;
      const roof = current[roofIndex];
      if (!roof) return;
      const path = roof.path.slice();
      path[vertexIndex] = next;
      const copy = current.slice();
      copy[roofIndex] = { ...roof, path };
      onRoofsChangeRef.current(copy);
    },
    [],
  );

  function closeDraft(path: LatLng[]) {
    let closed = path;
    if (closed.length >= 3) {
      const first = closed[0];
      const last = closed[closed.length - 1];
      if (haversineM(first, last) <= CLOSE_M) {
        closed = closed.slice(0, -1);
      }
    }
    if (closed.length < 3) return;
    if (!isSimpleRing(closed)) {
      setCloseError("That outline crosses itself, redraw without crossing lines.");
      return;
    }
    if (roofs.some((roof) => ringsOverlapExcessively(closed, roof.path))) {
      setCloseError(
        "That outline overlaps another roof face too much, redraw so faces barely touch.",
      );
      return;
    }
    setCloseError(null);
    const nextRoofs = [...roofs, emptyDrawnRoof(closed)];
    onRoofsChange(nextRoofs);
    setDraft([]);
    setCursor(null);
    setActiveRoofIndex(nextRoofs.length - 1);
    setDrawing(false);
  }

  function handleMapClick(event: MapMouseEvent) {
    const latLng = event.detail.latLng;
    if (!latLng) return;
    const click = { lat: latLng.lat, lng: latLng.lng };

    if (inObstructions && obstructionDraft) {
      if (!obstructionDraft.first) {
        setObstructionDraft({ ...obstructionDraft, first: click, preview: null });
        return;
      }
      if (!obstructionDraft.adjacent) {
        setObstructionDraft({
          ...obstructionDraft,
          adjacent: click,
          preview: null,
        });
        return;
      }
      if (activeRoofIndex === null) {
        setObstructionDraft(null);
        return;
      }
      const rectangle = rectangleFromThreeCorners(
        obstructionDraft.first,
        obstructionDraft.adjacent,
        click,
      );
      const roof = roofs[activeRoofIndex];
      updateRoof(activeRoofIndex, {
        ...roof,
        obstructions: [
          ...roof.obstructions,
          {
            kind: obstructionDraft.kind,
            bounds: rectangle.bounds,
            path: rectangle.path,
          },
        ],
      });
      setObstructionDraft(null);
      return;
    }

    if (!inFaces || !drawing) return;

    const snapped = findSnap(click, sharedVertices, zoom) ?? click;
    if (
      draft.length >= 3 &&
      haversineM(snapped, draft[0]) <=
        metersPerPixel(click.lat, zoom) * SNAP_PX
    ) {
      closeDraft(draft);
      return;
    }
    setDraft((current) => [...current, snapped]);
    setCloseError(null);
  }

  function handleMouseMove(event: MapMouseEvent) {
    const latLng = event.detail.latLng;
    if (!latLng) return;
    const point = { lat: latLng.lat, lng: latLng.lng };

    if (obstructionDraft?.first && obstructionDraft.adjacent) {
      setObstructionDraft({
        ...obstructionDraft,
        preview: rectangleFromThreeCorners(
          obstructionDraft.first,
          obstructionDraft.adjacent,
          point,
        ).path,
      });
      return;
    }

    if (obstructionDraft?.first) {
      setObstructionDraft({
        ...obstructionDraft,
        preview: null,
      });
      return;
    }

    if (inFaces && drawing && draft.length > 0) setCursor(point);
  }

  function handleCameraChanged(event: MapCameraChangedEvent) {
    if (typeof event.detail.zoom !== "number" || !event.detail.center) return;
    const nextZoom = Math.min(
      Math.max(event.detail.zoom, SATELLITE_MIN_ZOOM),
      SATELLITE_MAX_ZOOM,
    );
    const nextView = {
      center: {
        lat: event.detail.center.lat,
        lng: event.detail.center.lng,
      },
      zoom: nextZoom,
    };
    setZoom(nextZoom);
    onMapViewChange(nextView);
  }

  function handleDone() {
    // Roof replacement is priced from the outline alone. Roofline mode still
    // needs a gutters phase.
    if (inFaces && mode === "roofline") {
      onPhaseChange("gutters");
      return;
    }
    if (inFaces && roofs.length === 0) {
      setCloseError("Outline your roof first, then press Done.");
      return;
    }
    try {
      onContinue();
    } catch (err) {
      console.error("[belpa] draw Done failed", err);
      setCloseError("Couldn’t continue — try Reset, then outline again.");
    }
  }

  function toggleGutter(roofIndex: number, edgeIndex: number) {
    const roof = roofs[roofIndex];
    const set = new Set(roof.gutterEdgeIndices);
    if (set.has(edgeIndex)) set.delete(edgeIndex);
    else set.add(edgeIndex);
    updateRoof(roofIndex, {
      ...roof,
      gutterEdgeIndices: [...set].sort((a, b) => a - b),
    });
  }

  const gutterCount = roofs.reduce(
    (sum, roof) => sum + roof.gutterEdgeIndices.length,
    0,
  );

  // Only shown while actively placing points, static phase guidance lives in
  // the step heading, so repeating it here would just cover the imagery.
  const instruction = obstructionDraft
    ? !obstructionDraft.first
      ? `Tap the first corner of the ${obstructionDraft.kind}`
      : !obstructionDraft.adjacent
        ? "Tap the adjacent corner"
        : "Tap the opposite corner"
    : inFaces && drawing
      ? draft.length === 0
        ? null
        : draft.length < 3
          ? "Keep tapping corners to outline this face"
          : "Tap the tick on your first point to close the face"
      : null;

  const dashIcons = [
    {
      icon: {
        path: "M 0,-1 0,1",
        strokeOpacity: 0.55,
        scale: 2,
      },
      offset: "0",
      repeat: "10px",
    },
  ];

  const toolbarPrimary =
    "rounded-full bg-brand-500 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_8px_18px_-6px_rgba(31,87,240,0.55)] transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className={variant === "card" ? "relative min-h-0 flex-1" : ""}>
      <div
        className={`overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-soft)] ${
          variant === "card" ? "absolute inset-2" : `relative ${mapHeight}`
        }`}
      >
        <Map
        {...(mapView
          ? {
              // Defaults only — do NOT pass controlled center/zoom on every
              // camera tick. Re-driving the camera each frame thrashes tile
              // loads and is a common path into blank “no imagery” states.
              defaultCenter: mapView.center,
              defaultZoom: Math.min(mapView.zoom, SATELLITE_MAX_ZOOM),
            }
          : { defaultBounds: { ...scan.boundingBox, padding: 70 } })}
        mapTypeId="satellite"
        disableDefaultUI
        zoomControl
        minZoom={SATELLITE_MIN_ZOOM}
        maxZoom={SATELLITE_MAX_ZOOM}
        clickableIcons={false}
        gestureHandling="greedy"
        reuseMaps
        draggableCursor={
          (inFaces && drawing) || obstructionDraft ? BLUE_DOT_CURSOR : "grab"
        }
        style={{ width: "100%", height: "100%" }}
        onClick={handleMapClick}
        onMousemove={handleMouseMove}
        onCameraChanged={handleCameraChanged}
      >
        {roofs.map((roof, roofIndex) => (
          <Polygon
            key={roof.id}
            ref={(poly) => registerRoofPoly(roof.id, poly)}
            paths={previewPath(roof, roofIndex)}
            // Corners are edited via custom lollipop pins (below) so the point
            // floats above the finger — so native vertex handles are OFF. The
            // body stays draggable to move the whole box (captured on dragend).
            editable={false}
            draggable={inFaces && !drawing}
            geodesic
            fillColor={BRAND}
            fillOpacity={0.22}
            strokeColor={BRAND}
            strokeOpacity={1}
            strokeWeight={3}
            onPathsChanged={(paths) => {
              const nextPath = paths[0]?.map((point) => ({
                lat: point.lat(),
                lng: point.lng(),
              }));
              if (nextPath && nextPath.length >= 3) {
                updateRoof(roofIndex, { ...roof, path: nextPath });
              }
            }}
          />
        ))}

        {/* Corner handles. At rest these are bare crosshairs and nothing else —
            you grab the corner itself. On drag-start the icon re-anchors onto a
            grab ball under your thumb and the corner hops PIN_LIFT px clear
            (upward, leaning off the roof) so you can see where you're placing it.
            See the icon block at the top of this file for why the anchor swap is
            what does the work. Confirm mode only, not while drawing a fresh
            face. */}
        {inFaces && !drawing
          ? roofs.flatMap((roof, roofIndex) =>
              roof.path.map((point, vertexIndex) => {
                const dragging =
                  dragCorner !== null &&
                  dragCorner.roofIndex === roofIndex &&
                  dragCorner.vertexIndex === vertexIndex;
                const otherDragging = dragCorner !== null && !dragging;
                return (
                  <CornerMarker
                    key={`pin-${roof.id}-${vertexIndex}`}
                    // Resting position. Google owns it for the duration of a
                    // drag; state is committed once, on release. During the
                    // drag CornerMarker is memoised so this never re-applies —
                    // that's what keeps the ball from fighting the drag.
                    position={point}
                    roofIndex={roofIndex}
                    vertexIndex={vertexIndex}
                    // Inert while a different corner is mid-drag, so a stray
                    // second touch can't start a rival drag.
                    draggable={!otherDragging}
                    clickable={!otherDragging}
                    zIndex={dragging ? 40 : 30}
                    icon={
                      dragging
                        ? cornerGrabIcon(dragCorner.bearing)
                        : cornerTipIcon()
                    }
                    onCornerDragStart={handleCornerDragStart}
                    onCornerDrag={handleCornerDrag}
                    onCornerDragEnd={handleCornerDragEnd}
                  />
                );
              }),
            )
          : null}

        {/* Shared-vertex markers exist to START a new face by snapping to an
            existing corner. They must only appear while actively drawing —
            otherwise they sit on top of the editable polygon's corner handles
            and every attempt to drag a corner starts a new face instead. */}
        {inFaces && drawing
          ? roofs.flatMap((roof, roofIndex) =>
              roof.path.map((point, pointIndex) => (
                <Marker
                  key={`share-${roofIndex}-${pointIndex}`}
                  position={point}
                  clickable
                  zIndex={8}
                  onClick={() => {
                    if (!drawing) {
                      setDrawing(true);
                      setDraft([point]);
                    } else if (draft.length === 0) {
                      setDraft([point]);
                    } else if (
                      draft.length >= 3 &&
                      haversineM(point, draft[0]) < 0.5
                    ) {
                      closeDraft(draft);
                    } else {
                      setDraft((current) => [...current, point]);
                    }
                  }}
                  icon={{
                    path: SHARE_CIRCLE_PATH,
                    fillColor: "#ffffff",
                    fillOpacity: 0.95,
                    strokeColor: BRAND,
                    strokeWeight: 2,
                    scale: 1,
                  }}
                />
              )),
            )
          : null}

        {(inGutters || roofs.some((roof) => roof.gutterEdgeIndices.length > 0))
          ? roofs.flatMap((roof, roofIndex) =>
              roof.path.map((_, edgeIndex) => {
                const marked = roof.gutterEdgeIndices.includes(edgeIndex);
              if (!inGutters && !marked) return null;
                return (
                  <GutterEdge
                    key={`gutter-${roofIndex}-${edgeIndex}`}
                    path={roof.path}
                    edgeIndex={edgeIndex}
                    marked={marked}
                  onToggle={
                    inGutters
                      ? () => {
                          setActiveRoofIndex(roofIndex);
                          toggleGutter(roofIndex, edgeIndex);
                        }
                      : () => undefined
                  }
                  />
                );
              }),
            )
          : null}

        {roofs.flatMap((roof, roofIndex) =>
          roof.obstructions.map((obstruction, obsIndex) =>
            obstruction.path ? (
              <Polygon
                key={`obs-${roofIndex}-${obsIndex}`}
                paths={obstruction.path}
                fillColor={obstruction.kind === "chimney" ? CHIMNEY : ROOFLIGHT}
                fillOpacity={0.35}
                strokeColor={obstruction.kind === "chimney" ? CHIMNEY : ROOFLIGHT}
                strokeWeight={2}
                clickable={false}
              />
            ) : (
              <Rectangle
                key={`obs-${roofIndex}-${obsIndex}`}
                bounds={obstruction.bounds}
                fillColor={obstruction.kind === "chimney" ? CHIMNEY : ROOFLIGHT}
                fillOpacity={0.35}
                strokeColor={obstruction.kind === "chimney" ? CHIMNEY : ROOFLIGHT}
                strokeWeight={2}
                clickable={false}
              />
            ),
          ),
        )}

        {obstructionDraft?.preview ? (
          <Polygon
            paths={obstructionDraft.preview}
            fillColor={
              obstructionDraft.kind === "chimney" ? CHIMNEY : ROOFLIGHT
            }
            fillOpacity={0.25}
            strokeColor={
              obstructionDraft.kind === "chimney" ? CHIMNEY : ROOFLIGHT
            }
            strokeWeight={2}
            clickable={false}
          />
        ) : null}

        {draft.length >= 2 ? (
          <Polyline
            path={draft}
            clickable={false}
            geodesic
            strokeColor={BRAND}
            strokeOpacity={1}
            strokeWeight={3}
            zIndex={5}
          />
        ) : null}

        {inFaces && drawing && draft.length > 0 && cursor ? (
          <Polyline
            path={[draft[draft.length - 1], cursor]}
            clickable={false}
            geodesic
            strokeColor={BRAND}
            strokeOpacity={0}
            strokeWeight={2}
            zIndex={4}
            icons={dashIcons}
          />
        ) : null}

        {draft.map((point, index) => {
          const isCloseTarget = index === 0 && canClose;
          return (
            <Marker
              key={`draft-${index}-${point.lat}-${point.lng}`}
              position={point}
              clickable={isCloseTarget}
              onClick={isCloseTarget ? () => closeDraft(draft) : undefined}
              zIndex={isCloseTarget ? 20 : 10}
              title={isCloseTarget ? "Close the outline" : undefined}
              label={
                isCloseTarget
                  ? {
                      text: "✓",
                      color: "#ffffff",
                      fontWeight: "700",
                      fontSize: "15px",
                    }
                  : undefined
              }
              icon={{
                path: isCloseTarget ? TICK_CIRCLE_PATH : CIRCLE_PATH,
                fillColor: isCloseTarget ? BRAND : "#ffffff",
                fillOpacity: 1,
                strokeColor: isCloseTarget ? "#ffffff" : BRAND,
                strokeWeight: 2.5,
                scale: 1,
              }}
            />
          );
        })}
      </Map>

        {variant === "card" && measurementAreaM2 !== null && !drawing && mode === "roof" ? (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur-sm">
            ≈ {measurementAreaM2} m²
          </span>
        ) : null}

        {/* Small translucent hint pill at the top while there's still an
            outline to draw; it clears once a roof shape is in place. Kept
            visible during drawing - the enlarged map makes it unobtrusive. */}
        {variant === "card" && phase === "faces" && (drawing || roofs.length === 0) ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
            <span className="rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-medium text-white/95 shadow-sm backdrop-blur-sm">
              {closeError
                ? closeError
                : draft.length >= 3
                  ? "Tap the first point to finish"
                  : "Tap each corner of your roof"}
            </span>
          </div>
        ) : null}

        {/* Seeded/placed outline (not drawing): guide the user to adjust it,
            since the corners are draggable editable-polygon handles. */}
        {variant === "card" && phase === "faces" && !drawing && roofs.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
            <span className="rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-medium text-white/95 shadow-sm backdrop-blur-sm">
              {closeError ?? "Pull the corners in to cover just your roof, then Done"}
            </span>
          </div>
        ) : null}

        {variant === "page" && (instruction || closeError) ? (
          <div className="pointer-events-none absolute left-3 right-3 top-3 flex justify-center">
            <span className="rounded-full bg-[rgba(10,11,13,0.75)] px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm">
              {closeError ?? instruction}
            </span>
          </div>
        ) : null}

        {/* Floating CTA on the map for BOTH card and page. Page (mobile) used
            to put Done under a fixed-height map inside an overflow:hidden
            fullscreen shell — on iPhone the button was clipped with no way to
            scroll to it. Keep it on the imagery, clear of Google's zoom (+/−). */}
        <div className="absolute bottom-3 left-3 right-14 z-20 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {inFaces && drawing && draft.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => current.slice(0, -1))}
                    aria-label="Undo last point"
                    title="Undo last point"
                    className="grid size-8 place-items-center rounded-full bg-white/95 text-lg font-semibold text-ink shadow-sm"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft([]);
                      setCursor(null);
                    }}
                    className="rounded-full bg-white/95 px-3 py-2 text-[12px] font-semibold text-ink shadow-sm"
                  >
                    Clear
                  </button>
                </>
              ) : null}
              {inFaces && !drawing && roofs.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={onStartDrawing}
                    className="rounded-full bg-white/95 px-3 py-2 text-[12px] font-semibold text-ink shadow-sm"
                  >
                    Add face
                  </button>
                  <button
                    type="button"
                    onClick={onReset}
                    className="rounded-full bg-white/80 px-3 py-2 text-[12px] font-semibold text-ink shadow-sm"
                  >
                    Reset
                  </button>
                </>
              ) : null}
            </div>
            <ContinueBubble
              label={inFaces ? "Done" : inGutters ? "Done" : "Continue"}
              disabled={
                (inFaces && roofs.length === 0) ||
                (inGutters && mode === "roofline" && gutterCount === 0) ||
                (inObstructions && !ready)
              }
              onClick={handleDone}
            />
          </div>
      </div>

      {/* Page-only secondary controls under the map (Done lives on the map). */}
      {variant === "page" ? (
      <div className="mt-2 flex h-9 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        {measurementAreaM2 !== null && !drawing && mode === "roof" ? (
          <span className="rounded-full bg-[#f1f2f5] px-3 py-1.5 text-[11px] font-semibold text-ink-soft">
            ≈ {measurementAreaM2} m² measured
          </span>
        ) : null}
        <span className="flex-1" />

        {inGutters ? (
          <button
            type="button"
            onClick={handleDone}
            disabled={mode === "roofline" && gutterCount === 0}
            className={toolbarPrimary}
          >
            {gutterCount > 0
              ? "Done marking gutters"
              : mode === "roofline"
                ? "Mark a gutter edge to continue"
                : "Skip gutters"}
          </button>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

export function DrawRoofStep({
  scan,
  roofs,
  measurement,
  mode = "roof",
  onRoofsChange,
  onContinue,
  mapView,
  onMapViewChange,
}: {
  scan: SolarScan;
  roofs: DrawnRoof[];
  measurement: CombinedMeasurement | null;
  mode?: DrawMode;
  onRoofsChange: (roofs: DrawnRoof[]) => void;
  onContinue: () => void;
  mapView: { center: LatLng; zoom: number } | null;
  onMapViewChange: (view: { center: LatLng; zoom: number }) => void;
}) {
  const variant = useFlowVariant();
  const [phase, setPhase] = useState<Phase>("faces");
  const [startDrawingToken, setStartDrawingToken] = useState(0);
  const [resetToken, setResetToken] = useState(0);

  const measuredArea =
    measurement && measurement.surfaceAreaM2 > 0
      ? Math.round(measurement.surfaceAreaM2)
      : null;

  const ready =
    roofs.length > 0 &&
    phase === "obstructions" &&
    (mode === "roofline"
      ? (measurement?.gutterLengthM ?? 0) > 0
      : measuredArea !== null);

  const heading =
    phase === "faces"
      ? mode === "roofline"
        ? "Outline the building"
        : "Outline your roof faces"
      : "Mark the gutters";

  const sub =
    phase === "faces"
      ? mode === "roofline"
        ? "Draw each section, then press Done."
        : roofs.length > 0
          ? "Pull the corners in to cover just your roof, then press Done."
          : "Tap corners, then press Done."
      : "Tap edges where water runs off.";

  const info =
    phase === "faces"
      ? "Close each face with the tick on the first point. Shared corners snap automatically."
      : "Arrows point toward the gutter, the direction rainwater leaves the roof.";

  return (
    <StepShell bleed>
      {variant === "page" ? (
        <StepHeading sub={sub} info={info}>
          {heading}
        </StepHeading>
      ) : null}

      <DrawCanvas
        scan={scan}
        roofs={roofs}
        measurementAreaM2={measuredArea}
        mode={mode}
        phase={phase}
        startDrawingToken={startDrawingToken}
        resetToken={resetToken}
        onRoofsChange={onRoofsChange}
        onPhaseChange={setPhase}
        onStartDrawing={() => setStartDrawingToken((n) => n + 1)}
        onReset={() => {
          onRoofsChange([]);
          setResetToken((n) => n + 1);
          setPhase("faces");
        }}
        onContinue={onContinue}
        ready={ready}
        mapView={mapView}
        onMapViewChange={onMapViewChange}
      />

      {variant === "page" && phase === "faces" && roofs.length > 0 ? (
        <div className="mt-2 flex h-8 items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setStartDrawingToken((n) => n + 1)}
            className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-soft shadow-sm transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            + Add another {mode === "roofline" ? "section" : "roof face"}
          </button>
          <button
            type="button"
            onClick={() => {
              onRoofsChange([]);
              setResetToken((n) => n + 1);
              setPhase("faces");
            }}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-ink"
          >
            Start again
          </button>
        </div>
      ) : null}

      {/* Temporarily disabled: obstruction marking now bypasses this phase. */}
      {/* {variant === "page" && phase === "obstructions" ? (
        <PrimaryButton onClick={onContinue} disabled={!ready}>
          Continue
        </PrimaryButton>
      ) : null} */}
    </StepShell>
  );
}
