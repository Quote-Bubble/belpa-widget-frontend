"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  StepHeading,
  StepShell,
  useFlowVariant,
  useMapHeightClass,
} from "@/components/quote/ui";
import {
  CornerMarker,
  MapPanLock,
  cornerGrabIcon,
  cornerLiftPx,
  cornerTipIcon,
  liftBearing,
  polygonCentroid,
  readEventLatLng,
  setMapPanLocked,
} from "@/components/quote/corner-handles";
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
    /** 0 on a mouse — see cornerLiftPx. Carried on the drag rather than read
     *  per frame so the whole gesture behaves consistently. */
    lift: number;
    preview: LatLng | null;
  } | null>(null);
  // Drag handlers fire from Google listeners, so read the session off a ref
  // rather than trusting the closure they were created in.
  const dragSessionRef = useRef<{
    bearing: number;
    zoom: number;
    lift: number;
  } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapHeight = useMapHeightClass();
  const cornerDragging = dragCorner !== null;

  // While a lollipop corner is held, lock scroll so the finger doesn't move the
  // page under the map (iOS especially likes to rubber-band the scroller).
  useEffect(() => {
    if (!cornerDragging) return;
    const scroller = document.querySelector<HTMLElement>(".quote-flow-scroller");
    const prevScroller = scroller?.style.overflowY ?? "";
    const prevBody = document.body.style.overflow;
    if (scroller) scroller.style.overflowY = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      if (scroller) scroller.style.overflowY = prevScroller;
      document.body.style.overflow = prevBody;
    };
  }, [cornerDragging]);

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
      // Lock map pan on this same frame — don't wait for React to re-render
      // gestureHandling, or the first finger move pans the satellite.
      setMapPanLocked(mapRef.current, true);
      const bearing = liftBearing(point, polygonCentroid(roof.path));
      const lift = cornerLiftPx();
      dragSessionRef.current = { bearing, zoom: zoomRef.current, lift };
      setDragCorner({ roofIndex, vertexIndex, bearing, lift, preview: null });
    },
    [],
  );

  // Per-frame: the drag reports where the grab point is; the corner sits
  // session.lift px along the frozen bearing from it — which is zero on a
  // mouse, so there the corner simply IS the cursor. Only the preview reads it.
  const handleCornerDrag = useCallback((event: unknown) => {
    const session = dragSessionRef.current;
    const ball = readEventLatLng(event);
    if (!session || !ball) return;
    const corner = offsetByPixels(
      ball,
      session.bearing,
      session.lift,
      session.zoom,
    );
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
      setMapPanLocked(mapRef.current, false);
      const ball = readEventLatLng(event);
      if (!session || !ball) return;
      const next = offsetByPixels(
        ball,
        session.bearing,
        session.lift,
        session.zoom,
      );
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

  return (
    <div
      className={
        variant === "card"
          ? "relative flex min-h-0 flex-1 flex-col"
          : "flex flex-col"
      }
    >
      <div
        className={`overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-soft)] ${
          variant === "card"
            ? "absolute inset-2 bottom-[3.25rem]"
            : `relative ${mapHeight}`
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
        gestureHandling={cornerDragging ? "none" : "greedy"}
        reuseMaps
        draggableCursor={
          (inFaces && drawing) || obstructionDraft ? BLUE_DOT_CURSOR : "grab"
        }
        style={{ width: "100%", height: "100%" }}
        onClick={handleMapClick}
        onMousemove={handleMouseMove}
        onCameraChanged={handleCameraChanged}
      >
        <MapPanLock locked={cornerDragging} mapRef={mapRef} />
        {roofs.map((roof, roofIndex) => (
          <Polygon
            key={roof.id}
            ref={(poly) => registerRoofPoly(roof.id, poly)}
            paths={previewPath(roof, roofIndex)}
            // Corners are edited via custom lollipop pins (below) so the point
            // floats above the finger — so native vertex handles are OFF. The
            // body stays draggable to move the whole box (captured on dragend).
            editable={false}
            draggable={inFaces && !drawing && !cornerDragging}
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
            you grab the corner itself.

            On TOUCH, drag-start re-anchors the icon onto a grab ball under
            your thumb and the corner hops clear (upward, leaning off the roof)
            so a fingertip is not covering the thing it is placing. See the icon
            block at the top of this file for why the anchor swap does the work.

            On a MOUSE none of that happens: cornerLiftPx returns 0, so the
            crosshair stays on the cursor and the drag is direct. A cursor
            occludes nothing, so lifting the target away from it would only make
            the corner harder to aim.

            Confirm mode only, not while drawing a fresh face. */}
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
                      dragging && dragCorner.lift > 0
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

        {measurementAreaM2 !== null && !drawing && mode === "roof" ? (
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
      </div>

      {/* CTA bar is a SIBLING of the map frame, not a child of the Maps canvas
          container. On iOS Safari, Google Maps WebGL often steals taps from
          HTML overlays inside the map div even with high z-index — Done looked
          tappable and did nothing. Keep this outside that stacking context. */}
      <div
        className={
          variant === "card"
            ? "absolute bottom-2 left-2 right-2 z-30 flex items-center justify-between gap-2"
            : "relative z-30 mt-2 flex items-center justify-between gap-2"
        }
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {inFaces && drawing && draft.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setDraft((current) => current.slice(0, -1))}
                aria-label="Undo last point"
                title="Undo last point"
                className="grid size-8 place-items-center rounded-full bg-white text-lg font-semibold text-ink shadow-sm ring-1 ring-black/5"
              >
                ↶
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft([]);
                  setCursor(null);
                }}
                className="rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-ink shadow-sm ring-1 ring-black/5"
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
                className="rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-ink shadow-sm ring-1 ring-black/5"
              >
                Add face
              </button>
              <button
                type="button"
                onClick={onReset}
                className="rounded-full bg-white/90 px-3 py-2 text-[12px] font-semibold text-ink shadow-sm ring-1 ring-black/5"
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
        ? "Draw each section, then Done."
        : roofs.length > 0
          ? "Pull the corners onto your roof, then Done."
          : "Tap corners, then Done."
      : "Tap edges where water runs off.";

  const info =
    phase === "faces"
      ? "Close each face with the tick on the first point. Shared corners snap automatically."
      : "Arrows point toward the gutter, the direction rainwater leaves the roof.";

  return (
    <StepShell bleed>
      {variant === "page" ? (
        <StepHeading sub={sub} info={info} compact>
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

      {/* Temporarily disabled: obstruction marking now bypasses this phase. */}
      {/* {variant === "page" && phase === "obstructions" ? (
        <PrimaryButton onClick={onContinue} disabled={!ready}>
          Continue
        </PrimaryButton>
      ) : null} */}
    </StepShell>
  );
}
