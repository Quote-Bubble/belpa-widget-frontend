"use client";

import { useEffect, useRef, useState } from "react";
import { Map } from "@vis.gl/react-google-maps";
import type { MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { AnimatePresence, motion } from "motion/react";

import {
  PrimaryButton,
  StepHeading,
  StepShell,
  ContinueBubble,
  useFlowVariant,
  useMapHeightClass,
} from "@/components/quote/ui";
import { apiUrl } from "@/lib/api";
import { haversineM } from "@/lib/geo";
import type { LatLng, SolarScan } from "@/lib/types";

// Just enough of a hold that the spinner doesn't flash-and-vanish on a fast
// response — kept short so the flow feels instant when the network is quick.
const MIN_PHASE_MS = 240;

// Below this, the pin is treated as "still the same roof" rather than a
// deliberate move — comfortably absorbs map re-render/floating-point jitter
// between mounts, while staying well under the ~5-6 m gap between terraced
// houses, so an actual "wrong house, moved it next door" correction still
// triggers a fresh scan.
const SAME_ROOF_RADIUS_M = 3;

type Phase = "geocoding" | "confirm" | "scanning" | "error";

export function LocateStep({
  postcode,
  prefetched,
  previousScan,
  mapView,
  onMapViewChange,
  onSuccess,
  onFallback,
  onAddressResolved,
  onEditAddress,
}: {
  postcode: string;
  /** Resolved in the background as soon as the flow knew an address (see
   *  QuoteFlowBody's prefetch effect) — if it's already landed by the time
   *  this step mounts, skip the geocoding phase and go straight to confirm. */
  prefetched?: { coords: LatLng; formatted: string | null } | null;
  /** A scan already run earlier this session (e.g. the user went back past
   *  this step and came forward again without touching the pin). If the
   *  confirmed pin is still within SAME_ROOF_RADIUS_M of it, reuse it
   *  instead of paying for another Solar + reverse-geocode call. */
  previousScan?: {
    coords: LatLng;
    scan: SolarScan;
    formatted: string | null;
  } | null;
  mapView: { center: LatLng; zoom: number } | null;
  onMapViewChange: (view: { center: LatLng; zoom: number }) => void;
  onSuccess: (coords: LatLng, formatted: string | null, scan: SolarScan) => void;
  onFallback: (coords: LatLng | null, formatted: string | null, reason: string) => void;
  onAddressResolved: (coords: LatLng, formatted: string) => void;
  onEditAddress: () => void;
}) {
  const variant = useFlowVariant();
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>(prefetched ? "confirm" : "geocoding");
  const [error, setError] = useState<string | null>(null);
  const [geocoded, setGeocoded] = useState<{
    coords: LatLng;
    formatted: string | null;
  } | null>(prefetched ?? null);
  const [centre, setCentre] = useState<LatLng | null>(
    mapView?.center ?? prefetched?.coords ?? null,
  );
  const [zoom, setZoom] = useState(mapView?.zoom ?? 19);
  const mapHeight = useMapHeightClass();

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      geocodeAbortRef.current?.abort();
      scanAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Already resolved before this step was reached — nothing to fetch.
    if (prefetched) return;
    const startedAt = performance.now();
    const abort = new AbortController();
    geocodeAbortRef.current = abort;

    async function holdMinimum() {
      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_PHASE_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, MIN_PHASE_MS - elapsed),
        );
      }
    }

    async function runGeocode() {
      try {
        const url = apiUrl("/api/geocode");
        const geocodeResponse = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postcode }),
          signal: abort.signal,
        });
        if (cancelledRef.current || abort.signal.aborted) return;
        const raw = await geocodeResponse.text();
        if (cancelledRef.current || abort.signal.aborted) return;
        let geocodeBody: {
          coords?: LatLng;
          formattedAddress?: string;
          error?: string;
        } = {};
        try {
          geocodeBody = raw ? (JSON.parse(raw) as typeof geocodeBody) : {};
        } catch {
          throw new Error(
            `Geocode returned non-JSON (${geocodeResponse.status}) from ${url}`,
          );
        }
        await holdMinimum();
        if (cancelledRef.current || abort.signal.aborted) return;
        if (!geocodeResponse.ok || !geocodeBody.coords) {
          const message =
            typeof geocodeBody.error === "string"
              ? geocodeBody.error
              : "We couldn't find that postcode. Double-check it and try again.";
          setError(message);
          setPhase("error");
          return;
        }
        const next = {
          coords: geocodeBody.coords,
          formatted: geocodeBody.formattedAddress ?? null,
        };
        setGeocoded(next);
        setCentre(next.coords);
        onMapViewChange({ center: next.coords, zoom: 19 });
        setPhase("confirm");
      } catch (error) {
        if (abort.signal.aborted || cancelledRef.current) return;
        console.error("[belpa] geocode failed", error);
        await holdMinimum();
        if (cancelledRef.current) return;
        setError(
          "Something went wrong while finding that address. Check your connection and try again.",
        );
        setPhase("error");
      }
    }

    void runGeocode();
    return () => {
      abort.abort();
    };
  }, [postcode, prefetched, onMapViewChange]);

  async function confirmAndScan() {
    if (!geocoded || !centre) return;
    const confirmedCoords = centre;

    if (
      previousScan &&
      haversineM(confirmedCoords, previousScan.coords) <= SAME_ROOF_RADIUS_M
    ) {
      if (cancelledRef.current) return;
      onSuccess(confirmedCoords, previousScan.formatted, previousScan.scan);
      return;
    }

    setPhase("scanning");
    const startedAt = performance.now();
    const abort = new AbortController();
    scanAbortRef.current?.abort();
    scanAbortRef.current = abort;
    let formatted = geocoded.formatted;
    const reverseGeocode = fetch(apiUrl("/api/reverse-geocode"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coords: confirmedCoords }),
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { formattedAddress?: string };
        return typeof body.formattedAddress === "string" && body.formattedAddress
          ? body.formattedAddress
          : null;
      })
      .catch(() => null);
    // This request is a display upgrade only. Do not await it before taking the
    // user onward; if it arrives later, QuoteFlow applies it only if this pin
    // and postcode are still current.
    void reverseGeocode.then((resolved) => {
      if (!resolved || cancelledRef.current || abort.signal.aborted) return;
      formatted = resolved;
      onAddressResolved(confirmedCoords, resolved);
    });

    async function holdMinimum() {
      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_PHASE_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, MIN_PHASE_MS - elapsed),
        );
      }
    }

    try {
      const solarResponse = await fetch(apiUrl("/api/solar"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords: confirmedCoords }),
        signal: abort.signal,
      });
      if (cancelledRef.current || abort.signal.aborted) return;
      const solarBody = (await solarResponse.json()) as {
        scan?: SolarScan;
      };
      await holdMinimum();
      if (cancelledRef.current || abort.signal.aborted) return;

      if (!solarResponse.ok || !solarBody.scan) {
        onFallback(
          confirmedCoords,
          formatted,
          "Satellite measurement isn't available for this roof yet, so your roofer will price it after a quick call instead.",
        );
        return;
      }

      onSuccess(confirmedCoords, formatted, solarBody.scan);
    } catch {
      if (abort.signal.aborted || cancelledRef.current) return;
      await holdMinimum();
      if (cancelledRef.current) return;
      setError(
        "Something went wrong while measuring. Check your connection and try again.",
      );
      setPhase("error");
    }
  }

  function handleCameraChanged(event: MapCameraChangedEvent) {
    const next = event.detail.center;
    if (!next) return;
    const nextView = {
      center: { lat: next.lat, lng: next.lng },
      zoom: event.detail.zoom ?? zoom,
    };
    setCentre(nextView.center);
    setZoom(nextView.zoom);
    onMapViewChange(nextView);
  }

  if (phase === "error" || error) {
    return (
      <StepShell>
        <div className="mt-10 rounded-3xl border border-line bg-white p-6 text-center shadow-[var(--shadow-soft)]">
          <p className="text-[15px] font-semibold text-ink">
            {error ?? "We couldn't find that address."}
          </p>
          <PrimaryButton onClick={onEditAddress}>
            Check the address
          </PrimaryButton>
        </div>
      </StepShell>
    );
  }

  if (phase === "geocoding") {
    return (
      <StepShell>
        <div className="mt-10">
          <div className="q-map--loading">
            <div className="q-spinner" />
          </div>
          <p className="mt-5 text-center text-[15px] font-semibold text-ink">
            Finding your house…
          </p>
          <p className="mt-1 text-center text-[13px] text-muted">{postcode}</p>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell bleed>
      {variant === "page" ? (
        <StepHeading sub="Drag the map so the pin sits on your roof.">
          Is this your house?
        </StepHeading>
      ) : null}

      <div
        className={`overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-soft)] ${
          variant === "card" ? "absolute inset-2" : `relative ${mapHeight}`
        }`}
      >
        {centre ? (
          <Map
            center={centre}
            zoom={zoom}
            mapTypeId="satellite"
            disableDefaultUI
            zoomControl
            clickableIcons={false}
            gestureHandling="greedy"
            reuseMaps
            style={{ width: "100%", height: "100%" }}
            onCameraChanged={handleCameraChanged}
          />
        ) : null}

        {variant === "card" && phase === "confirm" ? (
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 text-center">
            <p className="text-[17px] font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
              Is this your house?
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
              Drag the map so the pin sits on your roof.
            </p>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {phase === "confirm" ? (
            <motion.div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.82 }}
              transition={{ duration: 0.16 }}
            >
              <div className="relative -translate-y-1/2">
                <svg width="36" height="48" viewBox="0 0 36 48" aria-hidden="true">
                  <path
                    d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z"
                    fill="#2f6bff"
                  />
                  <circle cx="18" cy="18" r="7" fill="#fff" />
                </svg>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {phase === "confirm" ? (
          <div className="absolute bottom-9 left-3 right-3 z-10 flex justify-end">
            <ContinueBubble
              label="Continue"
              ariaLabel="Yes, measure this roof"
              onClick={() => void confirmAndScan()}
            />
          </div>
        ) : null}

        {phase === "scanning" ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
            <span className="q-spinner" />
            <p className="text-[15px] font-semibold text-ink">
              Measuring your roof…
            </p>
          </div>
        ) : null}
      </div>
    </StepShell>
  );
}
