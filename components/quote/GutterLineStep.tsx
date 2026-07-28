"use client";

import { useState, type ReactNode } from "react";
import { Map, Marker, Polyline } from "@vis.gl/react-google-maps";
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
import { pathLengthM } from "@/lib/geo";
import type { LatLng, SolarScan } from "@/lib/types";

const GUTTER = "#f59e0b";
const POINT_PATH = "M -6 0 a 6 6 0 1 0 12 0 a 6 6 0 1 0 -12 0";
const BLUE_DOT_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 14 14\'%3E%3Ccircle cx=\'7\' cy=\'7\' r=\'4\' fill=\'%232f6bff\' stroke=\'white\' stroke-width=\'2\'/%3E%3C/svg%3E") 7 7, crosshair';

function ChimneyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
      <path d="M7 21v-9h4v-5h4v14M5 21h14M13 7V3h4v18" />
    </svg>
  );
}

function RooflightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
      <path d="m4 17 8-10 8 10M7 17h10M10 14h4" />
    </svg>
  );
}

function CounterControl({
  label,
  count,
  onChange,
  icon,
}: {
  label: string;
  count: number;
  onChange: (count: number) => void;
  icon: ReactNode;
}) {
  return (
    <div className="flex h-6 items-center gap-0.5 rounded-full bg-white/95 py-0.5 pl-0.5 pr-0.5 shadow-sm backdrop-blur-sm">
      <span className="grid size-4 place-items-center rounded-full bg-[#1f232b] text-white" title={label}>
        {icon}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, count - 1))}
        disabled={count === 0}
        aria-label={`Fewer ${label.toLowerCase()}`}
        className="grid size-4 place-items-center rounded-full bg-white text-[11px] font-semibold text-ink disabled:opacity-35"
      >
        −
      </button>
      <span className="w-3 text-center text-[10px] font-semibold text-ink">{count}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(9, count + 1))}
        aria-label={`More ${label.toLowerCase()}`}
        className="grid size-4 place-items-center rounded-full bg-brand-500 text-[11px] font-semibold text-white"
      >
        +
      </button>
    </div>
  );
}

/**
 * Draws gutter runs directly as open lines, no roof face to trace first.
 * Used whenever drawApproach() is "gutter_lines": detached/bungalow full
 * replacements (area already comes from the satellite scan) and every
 * gutters-only job (a footprint was never needed for that price either).
 */
export function GutterLineStep({
  scan,
  areaM2,
  runs,
  chimneyCount,
  rooflightCount,
  showObstructionCounts,
  continueDisabled = false,
  onRunsChange,
  onChimneyCountChange,
  onRooflightCountChange,
  onContinue,
  mapView,
  onMapViewChange,
}: {
  scan: SolarScan;
  areaM2: number | null;
  runs: LatLng[][];
  chimneyCount: number;
  rooflightCount: number;
  /** Roofline (gutters-only) jobs never price chimneys, so hide the count. */
  showObstructionCounts: boolean;
  /** Roofline jobs price gutter length directly, so at least one run is
   *  required; a full replacement's price doesn't depend on it. */
  continueDisabled?: boolean;
  onRunsChange: (runs: LatLng[][]) => void;
  onChimneyCountChange: (count: number) => void;
  onRooflightCountChange: (count: number) => void;
  onContinue: () => void;
  mapView: { center: LatLng; zoom: number } | null;
  onMapViewChange: (view: { center: LatLng; zoom: number }) => void;
}) {
  const variant = useFlowVariant();
  const [draft, setDraft] = useState<LatLng[]>([]);
  const mapHeight = useMapHeightClass();
  const gutterLengthM = runs.reduce((sum, run) => sum + pathLengthM(run), 0);

  function handleMapClick(event: MapMouseEvent) {
    const latLng = event.detail.latLng;
    if (!latLng) return;
    setDraft((current) => [...current, { lat: latLng.lat, lng: latLng.lng }]);
  }

  function finishRun() {
    if (draft.length < 2) return;
    onRunsChange([...runs, draft]);
    setDraft([]);
  }

  function removeRun(index: number) {
    onRunsChange(runs.filter((_, i) => i !== index));
  }

  function handleCameraChanged(event: MapCameraChangedEvent) {
    if (!event.detail.center || typeof event.detail.zoom !== "number") return;
    onMapViewChange({
      center: {
        lat: event.detail.center.lat,
        lng: event.detail.center.lng,
      },
      zoom: event.detail.zoom,
    });
  }

  const toolbarButton =
    "rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-soft shadow-sm transition-colors hover:border-brand-300 hover:text-brand-600";
  const toolbarPrimary =
    "rounded-full bg-brand-500 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_8px_18px_-6px_rgba(31,87,240,0.55)] transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";
  const counterButton =
    "grid size-6 place-items-center rounded-full bg-white text-ink-soft shadow-sm transition-colors hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <StepShell bleed>
      {variant === "page" ? (
        <StepHeading
          sub="Tap along the gutter run, then finish the line."
          info="Draw one line per gutter run, a detached extension often needs a second, separate line. Shared corners aren't required to line up."
        >
          Mark the gutters
        </StepHeading>
      ) : null}

      <div
        className={`overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-soft)] ${
          variant === "card" ? "absolute inset-2" : `relative ${mapHeight}`
        }`}
      >
        <Map
          {...(mapView
            ? { center: mapView.center, zoom: mapView.zoom }
            : { defaultBounds: { ...scan.boundingBox, padding: 60 } })}
          mapTypeId="satellite"
          disableDefaultUI
          zoomControl
          clickableIcons={false}
          gestureHandling="greedy"
          reuseMaps
          draggableCursor={BLUE_DOT_CURSOR}
          style={{ width: "100%", height: "100%" }}
          onClick={handleMapClick}
          onCameraChanged={handleCameraChanged}
        >
          {runs.map((run, index) => (
            <Polyline
              key={`run-${index}`}
              path={run}
              geodesic
              strokeColor={GUTTER}
              strokeOpacity={0.95}
              strokeWeight={5}
              zIndex={10}
              onClick={() => removeRun(index)}
            />
          ))}

          {draft.length >= 2 ? (
            <Polyline
              path={draft}
              clickable={false}
              geodesic
              strokeColor={GUTTER}
              strokeOpacity={0.8}
              strokeWeight={4}
              zIndex={8}
            />
          ) : null}

          {draft.map((point, index) => (
            <Marker
              key={`draft-${index}-${point.lat}-${point.lng}`}
              position={point}
              clickable={false}
              zIndex={12}
              icon={{
                path: POINT_PATH,
                fillColor: "#ffffff",
                fillOpacity: 1,
                strokeColor: GUTTER,
                strokeWeight: 2.5,
                scale: 1,
              }}
            />
          ))}
        </Map>

        {variant === "card" ? (
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 text-center">
            <p className="text-[17px] font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
              Mark the gutters
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
              Tap along a run, then finish the line.
            </p>
          </div>
        ) : null}

        <div className={`pointer-events-none absolute left-3 right-3 z-10 flex justify-center ${variant === "card" ? "top-3" : "top-3"}`}>
          <span className="rounded-full bg-[rgba(10,11,13,0.75)] px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm">
            {draft.length === 0
              ? "Tap the start of a gutter run"
              : draft.length === 1
                ? "Tap the next point along the run"
                : "Keep tapping, or finish the line"}
          </span>
        </div>

        {variant === "card" ? (
          <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* Temporarily disabled: retain this counter implementation until
                  chimney / rooflight pricing is brought back. */}
              {/* {showObstructionCounts && draft.length === 0 ? (
                <>
                  <CounterControl
                    label="Chimneys"
                    count={chimneyCount}
                    onChange={onChimneyCountChange}
                    icon={<ChimneyIcon />}
                  />
                  <CounterControl
                    label="Rooflights"
                    count={rooflightCount}
                    onChange={onRooflightCountChange}
                    icon={<RooflightIcon />}
                  />
                </>
              ) : null} */}
              {draft.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => current.slice(0, -1))}
                    aria-label="Undo last point"
                    title="Undo last point"
                    className="grid size-8 place-items-center rounded-full bg-white/95 text-lg font-semibold text-ink shadow-sm backdrop-blur-sm"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft([])}
                    className="rounded-full bg-white/95 px-3 py-2 text-[12px] font-semibold text-ink shadow-sm backdrop-blur-sm"
                  >
                    Clear
                  </button>
                </>
              ) : null}
            </div>
            <ContinueBubble
              label={draft.length >= 2 ? "Finish line" : "Continue"}
              disabled={draft.length === 1 || (draft.length === 0 && continueDisabled)}
              onClick={() => {
                if (draft.length >= 2) finishRun();
                else onContinue();
              }}
            />
          </div>
        ) : null}
      </div>

      {variant === "page" ? (
        <div>
      <div className="mt-2 flex h-9 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          <span className="truncate rounded-full bg-[#f1f2f5] px-3 py-1.5 text-[11px] font-semibold text-ink-soft">
          {areaM2 !== null ? `≈ ${areaM2} m² roof (from satellite)` : "Roof area from satellite"}
          {gutterLengthM > 0 ? ` · ≈ ${Math.round(gutterLengthM)} m gutter` : ""}
        </span>

        {/* Temporarily disabled: retain this page counter implementation until
            chimney / rooflight pricing is brought back. */}
        {/* {showObstructionCounts
          ? (
              [
                { label: "Chimneys", count: chimneyCount, onChange: onChimneyCountChange },
                { label: "Rooflights", count: rooflightCount, onChange: onRooflightCountChange },
              ] as const
            ).map(({ label, count, onChange }) => (
              <div
                key={label}
                className="flex items-center gap-1 rounded-full bg-[#f1f2f5] py-1 pl-2 pr-1"
              >
                <span className="text-[11px] font-semibold text-ink-soft">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(Math.max(0, count - 1))}
                  disabled={count === 0}
                  className={counterButton}
                  aria-label={`Fewer ${label.toLowerCase()}`}
                >
                  −
                </button>
                <span className="w-3.5 text-center text-[12px] font-semibold text-ink">
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(Math.min(9, count + 1))}
                  className={counterButton}
                  aria-label={`More ${label.toLowerCase()}`}
                >
                  +
                </button>
              </div>
            ))
          : null} */}

        <span className="flex-1" />

        {draft.length > 0 ? (
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
              onClick={() => setDraft([])}
              className={toolbarButton}
            >
              Clear
            </button>
          </>
        ) : null}
        {draft.length >= 2 ? (
          <button type="button" onClick={finishRun} className={toolbarPrimary}>
            Finish this line
          </button>
        ) : null}
      </div>

      <PrimaryButton onClick={onContinue} disabled={continueDisabled}>
        Continue
      </PrimaryButton>
        </div>
      ) : null}
    </StepShell>
  );
}
