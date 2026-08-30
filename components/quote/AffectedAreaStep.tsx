"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Map, Marker, Polygon } from "@vis.gl/react-google-maps";
import type { MapCameraChangedEvent } from "@vis.gl/react-google-maps";

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
import {
  ContinueBubble,
  StepShell,
  useFlowVariant,
  useMapHeightClass,
} from "@/components/quote/ui";
import {
  defaultAffectedAreaBox,
  updatePathCorner,
} from "@/lib/affected-area";
import { offsetByPixels, SATELLITE_MAX_ZOOM, SATELLITE_MIN_ZOOM } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

const AFFECTED = "#ef4444";
const PIN_BRAND = "#2f6bff";

function pinIcon(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">` +
    `<path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z" fill="${PIN_BRAND}" stroke="#fff" stroke-width="2.5"/>` +
    `<circle cx="18" cy="18" r="7" fill="#fff"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Repair-only step after the pin: mark the damaged patch with the same
 * mobile corner handles as the roof-replacement outline editor.
 */
export function AffectedAreaStep({
  coords,
  initialPath,
  mapView,
  onMapViewChange,
  onContinue,
  onSkip,
}: {
  coords: LatLng;
  initialPath: LatLng[] | null;
  mapView: { center: LatLng; zoom: number } | null;
  onMapViewChange: (view: { center: LatLng; zoom: number }) => void;
  onContinue: (path: LatLng[]) => void;
  onSkip: () => void;
}) {
  const variant = useFlowVariant();
  const mapHeight = useMapHeightClass();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [path, setPath] = useState<LatLng[]>(
    () => initialPath ?? defaultAffectedAreaBox(coords),
  );
  const pathRef = useRef(path);
  pathRef.current = path;

  const [zoom, setZoom] = useState(
    Math.min(mapView?.zoom ?? 19, SATELLITE_MAX_ZOOM),
  );
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Same session shape as DrawRoofStep: bearing + zoom frozen at grab-start;
  // preview is ball→crosshair resolved coords for the polygon only.
  const [dragCorner, setDragCorner] = useState<{
    vertexIndex: number;
    bearing: number;
    /** 0 on a mouse — see cornerLiftPx. */
    lift: number;
    preview: LatLng | null;
  } | null>(null);
  const dragSessionRef = useRef<{
    bearing: number;
    zoom: number;
    lift: number;
  } | null>(null);
  const cornerDragging = dragCorner !== null;

  const center = mapView?.center ?? coords;

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

  function handleCameraChanged(event: MapCameraChangedEvent) {
    const nextZoom = event.detail.zoom;
    setZoom(nextZoom);
    onMapViewChange({
      center: event.detail.center,
      zoom: nextZoom,
    });
  }

  function displayPath(): LatLng[] {
    if (!dragCorner?.preview) return path;
    return updatePathCorner(path, dragCorner.vertexIndex, dragCorner.preview);
  }

  const handleCornerDragStart = useCallback(
    (_roofIndex: number, vertexIndex: number, point: LatLng) => {
      setMapPanLocked(mapRef.current, true);
      const bearing = liftBearing(point, polygonCentroid(pathRef.current));
      const lift = cornerLiftPx();
      dragSessionRef.current = { bearing, zoom: zoomRef.current, lift };
      setDragCorner({ vertexIndex, bearing, lift, preview: null });
    },
    [],
  );

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

  const handleCornerDragEnd = useCallback(
    (event: unknown, _roofIndex: number, vertexIndex: number) => {
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
      setPath((current) => updatePathCorner(current, vertexIndex, next));
    },
    [],
  );

  const polyListener = useRef<google.maps.MapsEventListener | null>(null);
  function registerPoly(poly: google.maps.Polygon | null) {
    polyListener.current?.remove();
    polyListener.current = null;
    if (!poly) return;
    polyListener.current = poly.addListener("dragend", () => {
      const next = poly
        .getPath()
        .getArray()
        .map((ll) => ({ lat: ll.lat(), lng: ll.lng() }));
      if (next.length >= 3) setPath(next);
    });
  }

  return (
    <StepShell bleed>
      <div
        className={`overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-soft)] ${
          variant === "card"
            ? "absolute inset-2 bottom-[3.25rem]"
            : `relative ${mapHeight}`
        }`}
      >
        <Map
          defaultCenter={center}
          defaultZoom={zoom}
          mapTypeId="satellite"
          disableDefaultUI
          zoomControl
          minZoom={SATELLITE_MIN_ZOOM}
          maxZoom={SATELLITE_MAX_ZOOM}
          clickableIcons={false}
          gestureHandling={cornerDragging ? "none" : "greedy"}
          reuseMaps
          style={{ width: "100%", height: "100%" }}
          onCameraChanged={handleCameraChanged}
        >
          <MapPanLock locked={cornerDragging} mapRef={mapRef} />

          <Marker
            position={coords}
            clickable={false}
            zIndex={10}
            title="Where you dropped the pin"
            icon={pinIcon()}
          />

          <Polygon
            ref={registerPoly}
            paths={displayPath()}
            editable={false}
            draggable={!cornerDragging}
            geodesic
            fillColor={AFFECTED}
            fillOpacity={0.28}
            strokeColor={AFFECTED}
            strokeOpacity={1}
            strokeWeight={3}
          />

          {path.map((point, vertexIndex) => {
            const dragging =
              dragCorner !== null && dragCorner.vertexIndex === vertexIndex;
            const otherDragging = dragCorner !== null && !dragging;
            return (
              <CornerMarker
                key={`corner-${vertexIndex}`}
                position={point}
                roofIndex={0}
                vertexIndex={vertexIndex}
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
          })}
        </Map>

        {variant === "card" ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
            <span className="rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-medium text-white/95 shadow-sm backdrop-blur-sm">
              Pull the corners to cover the damaged area, then Done
            </span>
          </div>
        ) : (
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex justify-center">
            <span className="rounded-full bg-[rgba(10,11,13,0.75)] px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm">
              Pull the corners to cover the damaged area
            </span>
          </div>
        )}
      </div>

      <div
        className={
          variant === "card"
            ? "absolute bottom-2 left-2 right-2 z-30 flex flex-col items-end gap-2"
            : "relative z-30 mt-2 flex flex-col items-end gap-2"
        }
      >
        <ContinueBubble
          label="Done"
          ariaLabel="Save affected area and continue"
          onClick={() => onContinue(path)}
        />
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full border border-line bg-white/95 px-6 py-2.5 text-[14px] font-semibold text-ink-soft shadow-sm backdrop-blur-sm transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          Skip for now
        </button>
      </div>
    </StepShell>
  );
}
