"use client";

import { useEffect, useRef, useState } from "react";
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
import { haversineM, metersPerPixel, midpoint } from "@/lib/geo";
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
  const [zoom, setZoom] = useState(19);
  const [activeRoofIndex, setActiveRoofIndex] = useState<number | null>(
    roofs.length > 0 ? roofs.length - 1 : null,
  );
  const [obstructionDraft, setObstructionDraft] =
    useState<ObstructionDraft | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
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
  const polyListeners = useRef<Map<string, google.maps.MapsEventListener>>(
    new Map(),
  );
  function registerRoofPoly(id: string, poly: google.maps.Polygon | null) {
    const listeners = polyListeners.current;
    if (!poly) {
      listeners.get(id)?.remove();
      listeners.delete(id);
      return;
    }
    if (listeners.has(id)) return;
    const listener = poly.addListener("dragend", () => {
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
    listeners.set(id, listener);
  }

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
    const nextView = {
      center: {
        lat: event.detail.center.lat,
        lng: event.detail.center.lng,
      },
      zoom: event.detail.zoom,
    };
    setZoom(nextView.zoom);
    onMapViewChange(nextView);
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

  function undoObstruction() {
    if (activeRoofIndex === null) return;
    const roof = roofs[activeRoofIndex];
    if (roof.obstructions.length === 0) return;
    updateRoof(activeRoofIndex, {
      ...roof,
      obstructions: roof.obstructions.slice(0, -1),
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

  const toolbarButton =
    "rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-soft shadow-sm transition-colors hover:border-brand-300 hover:text-brand-600";
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
          ? { center: mapView.center, zoom: mapView.zoom }
          : { defaultBounds: { ...scan.boundingBox, padding: 70 } })}
        mapTypeId="satellite"
        disableDefaultUI
        zoomControl
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
            paths={roof.path}
            editable={inFaces && !drawing}
            // Let the whole outline be dragged over the roof (not just its
            // corners). The move is captured on `dragend` via registerRoofPoly.
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
              {closeError ?? "Drag the box onto your roof, pull the corners to fit, then Done"}
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

        {variant === "card" ? (
          <div className="absolute bottom-9 left-3 right-3 z-10 flex items-center justify-between gap-2">
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
              {/* Temporarily disabled: retain obstruction drawing controls until
                  chimney / rooflight pricing is brought back. */}
              {/* {inObstructions ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setObstructionDraft({
                        kind: "chimney",
                        first: null,
                        adjacent: null,
                        preview: null,
                      })
                    }
                    className="rounded-full bg-white/95 px-3 py-2 text-[12px] font-semibold text-ink shadow-sm"
                  >
                    Chimney
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setObstructionDraft({
                        kind: "rooflight",
                        first: null,
                        adjacent: null,
                        preview: null,
                      })
                    }
                    className="rounded-full bg-white/95 px-3 py-2 text-[12px] font-semibold text-ink shadow-sm"
                  >
                    Rooflight
                  </button>
                </>
              ) : null} */}
            </div>
            <ContinueBubble
              label={
                inFaces ? "Done" : inGutters ? "Done" : "Continue"
              }
              disabled={
                (inFaces && roofs.length === 0) ||
                (inGutters && mode === "roofline" && gutterCount === 0) ||
                (inObstructions && !ready)
              }
              onClick={() => {
                // A roof replacement is priced from the outline alone, gutters
                // are a survey-time add, not a reason to make people trace a
                // second shape. So finishing the outline goes straight on.
                // (The roofline mode, if ever routed here, still needs gutters.)
                if (inFaces) {
                  if (mode === "roofline") onPhaseChange("gutters");
                  else onContinue();
                } else onContinue();
              }}
            />
          </div>
        ) : null}
      </div>

      {/* Controls live below the map so they never cover the imagery, the
          zoom control, or Google's attribution. */}
      {variant === "page" ? (
      <div className="mt-2 flex h-9 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        {measurementAreaM2 !== null && !drawing && mode === "roof" ? (
          <span className="rounded-full bg-[#f1f2f5] px-3 py-1.5 text-[11px] font-semibold text-ink-soft">
            ≈ {measurementAreaM2} m² measured
          </span>
        ) : null}
        <span className="flex-1" />

        {inFaces && drawing && draft.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setDraft((current) => current.slice(0, -1))}
              aria-label="Undo last point"
              title="Undo last point"
              className={toolbarButton}
            >
              ↶
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft([]);
                setCursor(null);
              }}
              className={toolbarButton}
            >
              Clear
            </button>
          </>
        ) : null}

        {inFaces && !drawing && roofs.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              mode === "roofline" ? onPhaseChange("gutters") : onContinue()
            }
            className={toolbarPrimary}
          >
            Done
          </button>
        ) : null}

        {inGutters ? (
          <button
            type="button"
            // Obstruction marking is intentionally bypassed for now.
            onClick={onContinue}
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

        {/* Temporarily disabled: retain obstruction drawing controls until
            chimney / rooflight pricing is brought back. */}
        {/* {inObstructions ? (
          <>
            <button
              type="button"
              onClick={() =>
                setObstructionDraft({
                  kind: "chimney",
                  first: null,
                  adjacent: null,
                  preview: null,
                })
              }
              className={toolbarButton}
            >
              Chimney
            </button>
            <button
              type="button"
              onClick={() =>
                setObstructionDraft({
                  kind: "rooflight",
                  first: null,
                  adjacent: null,
                  preview: null,
                })
              }
              className={toolbarButton}
            >
              Rooflight
            </button>
            {(activeRoofIndex !== null &&
              roofs[activeRoofIndex]?.obstructions.length > 0) ||
            obstructionDraft ? (
              <button
                type="button"
                onClick={() => {
                  if (obstructionDraft) setObstructionDraft(null);
                  else undoObstruction();
                }}
                className={toolbarButton}
              >
                Undo
              </button>
            ) : null}
          </>
        ) : null} */}
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
          ? "Drag the box onto your roof and pull the corners to fit, then Done."
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
