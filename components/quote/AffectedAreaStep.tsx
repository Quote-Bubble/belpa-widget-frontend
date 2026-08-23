"use client";

import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  Map,
  Marker,
  Polygon,
  useMap,
} from "@vis.gl/react-google-maps";
import type { MapCameraChangedEvent } from "@vis.gl/react-google-maps";

import {
  ContinueBubble,
  StepShell,
  useFlowVariant,
  useMapHeightClass,
} from "@/components/quote/ui";
import {
  defaultAffectedAreaBox,
  readEventLatLng,
  updateRectCorner,
} from "@/lib/affected-area";
import { SATELLITE_MAX_ZOOM, SATELLITE_MIN_ZOOM } from "@/lib/geo";
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

function cornerIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 7,
    fillColor: "#ffffff",
    fillOpacity: 1,
    strokeColor: AFFECTED,
    strokeWeight: 2.5,
  };
}

function setMapPanLocked(map: google.maps.Map | null, locked: boolean) {
  if (!map) return;
  map.setOptions({
    gestureHandling: locked ? "none" : "greedy",
    draggable: !locked,
    keyboardShortcuts: !locked,
  });
}

function MapPanLock({
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
  cornerIndex: number;
  draggable: boolean;
  onCornerDragStart: (cornerIndex: number) => void;
  onCornerDrag: (event: unknown) => void;
  onCornerDragEnd: (event: unknown, cornerIndex: number) => void;
};

const CornerMarker = memo(function CornerMarker({
  position,
  cornerIndex,
  draggable,
  onCornerDragStart,
  onCornerDrag,
  onCornerDragEnd,
}: CornerMarkerProps) {
  return (
    <Marker
      position={position}
      draggable={draggable}
      clickable={draggable}
      zIndex={draggable ? 30 : 20}
      icon={cornerIcon()}
      onDragStart={() => onCornerDragStart(cornerIndex)}
      onDrag={(event) => onCornerDrag(event)}
      onDragEnd={(event) => onCornerDragEnd(event, cornerIndex)}
    />
  );
});

/**
 * Repair-only step after the pin: mark the damaged patch on the same satellite
 * view. Skippable — the lead still carries the pin either way.
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
  const dragCornerRef = useRef<number | null>(null);
  const [path, setPath] = useState<LatLng[]>(
    () => initialPath ?? defaultAffectedAreaBox(coords),
  );
  const [dragCorner, setDragCorner] = useState<number | null>(null);

  const center = mapView?.center ?? coords;
  const zoom = Math.min(mapView?.zoom ?? 19, SATELLITE_MAX_ZOOM);

  function handleCameraChanged(event: MapCameraChangedEvent) {
    const next = {
      center: event.detail.center,
      zoom: event.detail.zoom,
    };
    onMapViewChange(next);
  }

  function handleCornerDragStart(cornerIndex: number) {
    dragCornerRef.current = cornerIndex;
    setDragCorner(cornerIndex);
  }

  function handleCornerDrag(event: unknown) {
    const cornerIndex = dragCornerRef.current;
    if (cornerIndex === null) return;
    const point = readEventLatLng(event);
    if (!point) return;
    setPath((current) => updateRectCorner(current, cornerIndex, point));
  }

  function handleCornerDragEnd(event: unknown, cornerIndex: number) {
    const point = readEventLatLng(event);
    if (point) {
      setPath((current) => updateRectCorner(current, cornerIndex, point));
    }
    dragCornerRef.current = null;
    setDragCorner(null);
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
          gestureHandling={dragCorner !== null ? "none" : "greedy"}
          reuseMaps
          style={{ width: "100%", height: "100%" }}
          onCameraChanged={handleCameraChanged}
        >
          <MapPanLock locked={dragCorner !== null} mapRef={mapRef} />

          <Marker
            position={coords}
            clickable={false}
            zIndex={10}
            title="Where you dropped the pin"
            icon={pinIcon()}
          />

          <Polygon
            paths={path}
            draggable={dragCorner === null}
            geodesic
            fillColor={AFFECTED}
            fillOpacity={0.28}
            strokeColor={AFFECTED}
            strokeOpacity={1}
            strokeWeight={3}
            onPathsChanged={(paths) => {
              const nextPath = paths[0]?.map((point) => ({
                lat: point.lat(),
                lng: point.lng(),
              }));
              if (nextPath && nextPath.length === 4) setPath(nextPath);
            }}
          />

          {path.map((point, cornerIndex) => (
            <CornerMarker
              key={`corner-${cornerIndex}`}
              position={point}
              cornerIndex={cornerIndex}
              draggable={dragCorner === null || dragCorner === cornerIndex}
              onCornerDragStart={handleCornerDragStart}
              onCornerDrag={handleCornerDrag}
              onCornerDragEnd={handleCornerDragEnd}
            />
          ))}
        </Map>

        {variant === "card" ? (
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 text-center">
            <p className="text-[17px] font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
              Mark the damaged area
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
              Drag the box corners, or move the whole box. Skip if you are not sure.
            </p>
          </div>
        ) : (
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 rounded-2xl bg-black/55 px-4 py-3 text-center backdrop-blur-sm">
            <p className="text-[16px] font-semibold text-white">
              Mark the damaged area
            </p>
            <p className="mt-0.5 text-[13px] text-white/85">
              Drag the corners to fit the patch on your roof.
            </p>
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
          label="Continue"
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
