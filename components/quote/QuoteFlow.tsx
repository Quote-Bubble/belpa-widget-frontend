"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

import { DrawRoofStep } from "@/components/quote/DrawRoofStep";
import { AffectedAreaStep } from "@/components/quote/AffectedAreaStep";
import { EstimateStep } from "@/components/quote/EstimateStep";
import { QuoteNextStep } from "@/components/quote/QuoteNextStep";
import { GutterLineStep } from "@/components/quote/GutterLineStep";
import { LocateStep } from "@/components/quote/LocateStep";
import { PhotosStep } from "@/components/quote/PhotosStep";
import {
  AddressStep,
  ConsultationStep,
  ContactStep,
  MaterialStep,
  OptionListStep,
  RepairSizeStep,
} from "@/components/quote/steps";
import {
  BackButton,
  FlowVariantProvider,
  ProgressHeader,
  useFlowVariant,
  type FlowVariant,
} from "@/components/quote/ui";
import { apiUrl } from "@/lib/api";
import type { CompressedPhoto } from "@/lib/image-compress";
import { uploadAndGrade } from "@/lib/severity-client";
import { addressEntryReady } from "@/components/quote/AddressEntry";
import { materialLabel, materialOptionsFor } from "@/lib/materials";
import type { QuoteConfig } from "@/lib/quote-config";
import { defaultQuoteConfig } from "@/lib/quote-config";
import {
  extractPostcode,
  looksLikeUkPostcode,
  normalisePostcode,
  prettyPostcode,
} from "@/lib/postcode";
import {
  JOB_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  DRIVEWAY_SURFACE_OPTIONS,
  isPlausibleDrivewayAreaM2,
  REPAIR_BANDS,
  ROOFLINE_SCOPE_OPTIONS,
  STOREY_OPTIONS,
  buildLeadPayload,
  computeFlowQuote,
  createFlowAnswers,
  displayAddress,
  drawApproach,
  emptyDrawnRoof,
  flowPath,
  measureRoofs,
  measureWholeRoof,
  nextStep,
  previousStep,
  progressPercent,
  stepSequence,
  type FlowStepId,
  type QuoteFlowAnswers,
} from "@/lib/quote-flow";
import type { SiteObservation } from "@/lib/site-access";
import { pathFromBounds } from "@/lib/roof-geometry";
import { defaultAffectedAreaBox } from "@/lib/affected-area";
import { polygonAreaM2 } from "@/lib/geo";
import type { LatLng, SolarScan } from "@/lib/types";
import { ADVANCE_DELAY_MS, STEP_TRANSITION } from "@/lib/motion";
import { track } from "@/lib/analytics";
import {
  newSubmissionId,
  postLeadWithRetry,
  savePendingLead,
} from "@/lib/pending-lead";

type SubmitStatus = "idle" | "busy" | "error" | "done";

/** Dev-only: which step to jump straight to, from ?preview= in the URL. */
export function previewStep(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("preview");
  } catch {
    return null;
  }
}

/** Mock answers that yield a real (repair) quote, used by ?preview=estimate. */
function buildPreviewAnswers(rooferId: string): QuoteFlowAnswers {
  const answers = createFlowAnswers(rooferId, {
    line: "65 Gannicox Rd, Stroud",
    postcode: "GL5 4HA",
    formatted: "65 Gannicox Rd, Stroud GL5 4HA, UK",
  });
  answers.jobType = "tile_or_slate_repair";
  answers.repairBandId = "section";
  answers.material = "natural_slate";
  answers.condition = "not_sure";
  answers.contact = { name: "Rafil Gohar", phone: "07000000000", email: "" };
  return answers;
}

type FlowState = {
  answers: QuoteFlowAnswers;
  step: FlowStepId;
  direction: 1 | -1;
  submitStatus: SubmitStatus;
  submitError: string | null;
};

type FlowAction =
  | { type: "PATCH"; patch: Partial<QuoteFlowAnswers> }
  | { type: "GO_NEXT" }
  | { type: "GO_BACK" }
  | { type: "GO_TO"; step: FlowStepId }
  | {
      type: "SCAN_SUCCESS";
      coords: LatLng;
      formatted: string | null;
      scan: SolarScan;
    }
  | {
      type: "SCAN_FALLBACK";
      coords: LatLng | null;
      formatted: string | null;
      reason: string;
    }
  | {
      type: "ADDRESS_RESOLVED";
      postcode: string;
      coords: LatLng;
      formatted: string;
    }
  | {
      /** Pin confirmed on a path that does not scan (repair). */
      type: "PIN_CONFIRMED";
      coords: LatLng;
      formatted: string | null;
    }
  | { type: "SUBMIT_START"; patch: Partial<QuoteFlowAnswers> }
  | { type: "SUBMIT_ERROR"; message: string }
  | { type: "SUBMIT_DONE" }
  | {
      type: "HYDRATE_PREVIEW";
      answers: QuoteFlowAnswers;
      step: FlowStepId;
    };

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "PATCH": {
      const patch = { ...action.patch };
      // Changing job type invalidates material / repair / roofline choices that
      // may no longer apply to the new path.
      if ("jobType" in patch && patch.jobType !== state.answers.jobType) {
        patch.material = null;
        patch.repairBandId = null;
        patch.rooflineScope = null;
        patch.fallbackReason = null;
        // Photos are of a specific problem; they mean nothing for a different
        // job, and a stale severity would silently keep skewing the price.
        patch.photos = [];
        patch.photoPaths = [];
        patch.severity = null;
        patch.affectedArea = null;
      }
      return { ...state, answers: { ...state.answers, ...patch } };
    }
    case "GO_NEXT": {
      // If we're stranded on a step that isn't in this path (historically
      // SCAN_SUCCESS always jumped to draw_roof even for scan_only detached /
      // bungalow), nextStep still advances from locate so Done is never a no-op.
      const step =
        nextStep(state.answers, state.step) ??
        (state.step === "draw_roof" ? nextStep(state.answers, "locate") : null);
      return step ? { ...state, step, direction: 1 } : state;
    }
    case "GO_BACK": {
      const step = previousStep(state.answers, state.step);
      return step
        ? {
            ...state,
            step,
            direction: -1,
            submitStatus: "idle",
            submitError: null,
          }
        : state;
    }
    case "GO_TO":
      return { ...state, step: action.step, direction: -1 };
    case "SCAN_SUCCESS": {
      // Ignore late scan responses after the user has left the locate step.
      if (state.step !== "locate") return state;
      // Outline path: seed the whole detected building so the user trims in
      // rather than tracing from blank. scan_only / gutter_lines: no seed.
      const approach = drawApproach(
        state.answers.jobType,
        state.answers.propertyType,
      );
      const roofs =
        approach === "outline" && state.answers.roofs.length === 0
          ? [emptyDrawnRoof(pathFromBounds(action.scan.boundingBox))]
          : state.answers.roofs;
      const answers = {
        ...state.answers,
        coords: action.coords,
        address: {
          ...state.answers.address,
          // The user's typed first line is the source of truth, never let the
          // pin's reverse-geocode overwrite it (the pin can resolve a different
          // house). Only fall back to the resolved address when no line exists.
          formatted: state.answers.address.line?.trim()
            ? state.answers.address.formatted
            : (action.formatted ?? state.answers.address.formatted),
        },
        scan: action.scan,
        roofs,
      };
      // Follow the path sequence — never hardcode draw_roof. Detached /
      // bungalow (scan_only) skip drawing and go to material; forcing
      // draw_roof left Done calling GO_NEXT with nextStep=null (stuck).
      const step = nextStep(answers, "locate") ?? "contact";
      return { ...state, answers, step, direction: 1 };
    }
    case "SCAN_FALLBACK": {
      if (state.step !== "locate") return state;
      const answers = {
        ...state.answers,
        coords: action.coords,
        address: {
          ...state.answers.address,
          // The user's typed first line is the source of truth, never let the
          // pin's reverse-geocode overwrite it (the pin can resolve a different
          // house). Only fall back to the resolved address when no line exists.
          formatted: state.answers.address.line?.trim()
            ? state.answers.address.formatted
            : (action.formatted ?? state.answers.address.formatted),
        },
        fallbackReason: action.reason,
      };
      return { ...state, answers, step: "contact", direction: 1 };
    }
    case "PIN_CONFIRMED": {
      // Ignore a late confirm after the user has already left the step.
      if (state.step !== "locate") return state;
      const answers = {
        ...state.answers,
        coords: action.coords,
        address: {
          ...state.answers.address,
          // Same rule as the scanning paths: the user's typed first line wins,
          // because the pin's reverse-geocode can resolve to a different house.
          formatted: state.answers.address.line?.trim()
            ? state.answers.address.formatted
            : (action.formatted ?? state.answers.address.formatted),
        },
      };
      // Follow the sequence rather than naming the next step, so this keeps
      // working if the repair path gains or loses a step.
      const step = nextStep(answers, "locate") ?? "contact";
      return { ...state, answers, step, direction: 1 };
    }
    case "ADDRESS_RESOLVED": {
      const stateCoords = state.answers.coords;
      // A response for a postcode the user has since changed is always stale.
      if (
        normalisePostcode(state.answers.address.postcode) !==
        normalisePostcode(action.postcode)
      ) {
        return state;
      }

      /* Adopt the geocoded coordinates when we have none.
       *
       * This case used to require that state.coords ALREADY equalled the
       * incoming coords, which is unsatisfiable before anything has set them —
       * so the first write never happened and the coordinates were discarded.
       *
       * Only the "measured" and "roofline" paths run a locate step, so repair,
       * flat and consultation leads reached the database with coords null. The
       * geocode had fetched them correctly every time; the reducer threw them
       * away. That is why a tile-repair lead shows no street view: not because
       * the customer skipped the roof outline, but because nothing ever stored
       * a position for the property.
       *
       * Postcode-centroid accuracy is coarser than a dropped pin, which is why
       * scan coordinates still win — they are never overwritten below. But a
       * centroid is easily good enough to find the right street, and street
       * view is snapped to the nearest panorama and aimed by bearing anyway. */
      if (!stateCoords) {
        return {
          ...state,
          answers: {
            ...state.answers,
            coords: action.coords,
            address: {
              ...state.answers.address,
              formatted: state.answers.address.line?.trim()
                ? state.answers.address.formatted
                : action.formatted,
            },
          },
        };
      }

      const coordsMatch =
        stateCoords.lat === action.coords.lat &&
        stateCoords.lng === action.coords.lng;
      // Coords already set from a scan: more precise, so never clobber them.
      if (!coordsMatch) return state;
      {
        // The user types their own first line now, so their address
        // ("14 Elm Grove, M1 2AB", set in continueFromAddress) is the source
        // of truth, keep it. Only fall back to the reverse-geocoded street if
        // for some entry path no first line was captured. Using reverse-geocode
        // when a line exists would duplicate the road name.
        const line = state.answers.address.line?.trim();
        const formatted = line
          ? state.answers.address.formatted
          : action.formatted;
        return {
          ...state,
          answers: {
            ...state.answers,
            address: { ...state.answers.address, formatted },
          },
        };
      }
    }
    case "SUBMIT_START":
      return {
        ...state,
        answers: { ...state.answers, ...action.patch },
        submitStatus: "busy",
        submitError: null,
      };
    case "SUBMIT_ERROR":
      return { ...state, submitStatus: "error", submitError: action.message };
    case "SUBMIT_DONE": {
      // Ignore late submit confirmations after leaving the contact step.
      if (state.step !== "contact") return state;
      const step = nextStep(state.answers, "contact") ?? state.step;
      return { ...state, submitStatus: "done", step, direction: 1 };
    }
    case "HYDRATE_PREVIEW":
      return {
        answers: action.answers,
        step: action.step,
        direction: 1,
        submitStatus: "idle",
        submitError: null,
      };
  }
}

export type QuoteFlowProps = {
  rooferId?: string;
  brandName?: string;
  quoteConfig?: QuoteConfig | null;
  initialAddress?: { postcode: string; formatted?: string | null };
  onClose?: () => void;
  variant?: FlowVariant;
};

/** Flow without a maps provider, for hosts (like the bubble) that already
 *  mount an APIProvider of their own. */
export function QuoteFlowInner({
  rooferId = "demo-roofer",
  brandName = "Belpa",
  quoteConfig = null,
  initialAddress,
  onClose,
  mapsEnabled,
  variant = "page",
}: QuoteFlowProps & { mapsEnabled: boolean }) {
  return (
    <MotionConfig reducedMotion="user">
      <FlowVariantProvider variant={variant}>
        <QuoteFlowBody
          rooferId={rooferId}
          brandName={brandName}
          quoteConfig={quoteConfig}
          initialAddress={initialAddress}
          onClose={onClose}
          mapsEnabled={mapsEnabled}
        />
      </FlowVariantProvider>
    </MotionConfig>
  );
}

function QuoteFlowBody({
  rooferId = "demo-roofer",
  brandName = "Belpa",
  quoteConfig = null,
  initialAddress,
  onClose,
  mapsEnabled,
}: QuoteFlowProps & { mapsEnabled: boolean }) {
  const config = quoteConfig ?? defaultQuoteConfig();
  const variant = useFlowVariant();
  const [state, dispatch] = useReducer(reducer, undefined, (): FlowState => {
    const answers = createFlowAnswers(rooferId, {
      postcode: initialAddress?.postcode ?? "",
      formatted: initialAddress?.formatted ?? null,
    });
    // Always land on the address step first, even when the bubble already
    // captured a valid postcode. It shows that postcode pre-filled and asks
    // for the house number/name, the roofer needs a specific, contactable
    // property, and we capture it up front (lowest drop-off point) rather
    // than at the contact step at the very end.
    return {
      answers,
      step: "address",
      direction: 1,
      submitStatus: "idle",
      submitError: null,
    };
  });
  const advanceTimerRef = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // One stable id for the whole session so the initial lead and any later
  // intent promotion (see promoteToQuoteRequested) collapse into one row via
  // the backend's upsert-on-id. Generated lazily on first submit.
  const submissionIdRef = useRef<string | null>(null);
  const flowMountedAtRef = useRef<number>(Date.now());
  const [intentPromoted, setIntentPromoted] = useState(false);

  // Damage photos live in local component state, not the reducer, because they
  // carry object URLs that need revoking — the reducer's answers are cloned
  // freely and would leak them. Only the graded result and storage paths are
  // promoted into answers, where pricing can see them.
  const [photos, setPhotos] = useState<CompressedPhoto[]>([]);
  const [grading, setGrading] = useState(false);

  /**
   * Upload, grade, then advance. Any failure still advances: a customer who
   * attached photos must never be worse off than one who skipped, so a grading
   * outage simply produces the same estimate they would have had anyway.
   */
  const submitPhotos = async () => {
    if (photos.length === 0) {
      dispatch({ type: "GO_NEXT" });
      return;
    }
    setGrading(true);
    submissionIdRef.current ??= newSubmissionId();
    try {
      const result = await uploadAndGrade(
        photos.map((p) => p.file),
        state.answers.jobType ?? "",
        state.answers.rooferId,
        submissionIdRef.current,
      );
      dispatch({
        type: "PATCH",
        patch: {
          photos: photos.map((p) => p.file),
          photoPaths: result.photoPaths,
          severity: result.severity,
        },
      });
    } finally {
      setGrading(false);
      dispatch({ type: "GO_NEXT" });
    }
  };

  /** Explicit skip: clear anything attached so pricing sees a clean "no". */
  const skipPhotos = () => {
    for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    setPhotos([]);
    dispatch({
      type: "PATCH",
      patch: { photos: [], photoPaths: [], severity: null },
    });
    dispatch({ type: "GO_NEXT" });
  };

  // Dev shortcut: ?preview=estimate seeds a finished repair estimate so the
  // estimate screen can be opened directly while designing it. Applied after
  // mount so SSR / first paint stay non-preview (avoids hydration mismatch).
  useEffect(() => {
    if (previewStep() !== "estimate") return;
    dispatch({
      type: "HYDRATE_PREVIEW",
      answers: buildPreviewAnswers(rooferId),
      step: "estimate",
    });
  }, [rooferId]);

  const { answers, step } = state;

  // Resolve the pin location in the background the moment we know an
  // address, by the time the user reaches "locate" (after job type /
  // property type / storeys), the pin is usually already sitting on the
  // roof, so that step only has to ask for confirmation, not look anything up.
  const [prefetchedGeocode, setPrefetchedGeocode] = useState<{
    key: string;
    coords: LatLng;
    formatted: string | null;
  } | null>(null);
  const addressKey = answers.address.postcode.trim().toLowerCase();
  const [returnToLocate, setReturnToLocate] = useState(false);
  const [mapView, setMapView] = useState<{
    center: LatLng;
    zoom: number;
  } | null>(null);
  useEffect(() => {
    if (!looksLikeUkPostcode(answers.address.postcode) || !mapsEnabled) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch(apiUrl("/api/geocode"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Extracted, not raw. The field normalises on blur, but submitting
          // with Enter straight from typing skips that — and this is the value
          // the geocoder resolves against, so a pasted
          // "HP13 5BP, 8 MAITLAND DRIVE" must not reach it intact.
          body: JSON.stringify({
            postcode:
              extractPostcode(answers.address.postcode) ??
              answers.address.postcode,
          }),
        });
        const body = (await response.json()) as {
          coords?: LatLng;
          formattedAddress?: string;
        };
        if (active && response.ok && body.coords) {
          setPrefetchedGeocode({
            key: addressKey,
            coords: body.coords,
            formatted: body.formattedAddress ?? null,
          });

          /* Also commit the coordinates to the answers.
           *
           * This result used to be kept purely as a hint for LocateStep, which
           * is the ONLY place that dispatched ADDRESS_RESOLVED. But just two of
           * the five flow paths render a locate step, so repair, flat and
           * consultation leads reached the database with coords null — no
           * street view in the dashboard, and no site-access observation
           * either, since that is keyed on coords too.
           *
           * The geocode had run correctly on every one of those leads. The
           * result simply had nowhere to go.
           *
           * Safe to dispatch unconditionally: the reducer adopts these only
           * when nothing has set coords yet, and a later SCAN_SUCCESS is more
           * precise and overwrites them, so paths that do locate are
           * unaffected. */
          dispatch({
            type: "ADDRESS_RESOLVED",
            postcode: answers.address.postcode,
            coords: body.coords,
            formatted: body.formattedAddress ?? "",
          });
        }
      } catch {
        // Silent, LocateStep falls back to its own live geocode call.
      }
    })();
    return () => {
      active = false;
    };
  }, [addressKey, answers.address.postcode, mapsEnabled]);

  function clearAdvanceTimer() {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }

  useEffect(() => () => clearAdvanceTimer(), []);

  /* Site access observation.
   *
   * Fires once coordinates are known and runs in the background while the user
   * answers material and contact — so it costs no visible latency and the
   * estimate simply has it, or does not.
   *
   * Nothing awaits it and nothing fails without it: on any error the effect is
   * neutral and the quote prices exactly as it did before this existed. Started
   * after the scan on purpose, so two paid requests never race for the same
   * moment. */
  const siteRequested = useRef<string | null>(null);
  useEffect(() => {
    const coords = answers.coords;
    if (!coords || answers.siteObservation) return;
    const key = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
    if (siteRequested.current === key) return;
    siteRequested.current = key;

    let active = true;
    (async () => {
      try {
        const response = await fetch(apiUrl("/api/site-access"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coords }),
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          observation?: SiteObservation | null;
        };
        if (active && body.observation?.imageryUsable) {
          dispatch({
            type: "PATCH",
            patch: { siteObservation: body.observation },
          });
        }
      } catch {
        /* Accuracy improvement, not a dependency. Silence is the right failure. */
      }
    })();
    return () => {
      active = false;
    };
  }, [answers.coords, answers.siteObservation]);

  const approach = drawApproach(answers.jobType, answers.propertyType);
  const measurement = useMemo(() => {
    if (!answers.scan) return null;
    if (approach === "gutter_lines" || approach === "scan_only") {
      // scan_only passes no gutter runs because none were collected — the
      // whole-roof area still comes from the scan exactly as before, and
      // gutterLengthM lands at 0 so the gutter line simply drops out of the
      // estimate. Under-stating a survey-confirmed guide is the safe direction;
      // the roofer adds gutters on the visit.
      return measureWholeRoof(
        answers.scan,
        approach === "scan_only" ? [] : answers.gutterRuns,
        answers.chimneyCount,
        answers.rooflightCount,
      );
    }
    return answers.roofs.length > 0
      ? measureRoofs(answers.scan, answers.roofs)
      : null;
  }, [
    answers.scan,
    answers.roofs,
    answers.gutterRuns,
    answers.chimneyCount,
    answers.rooflightCount,
    approach,
  ]);
  const quote = useMemo(
    () => computeFlowQuote(answers, measurement, config),
    [answers, measurement, config],
  );

  const jobTypeOptions = useMemo(
    () =>
      JOB_TYPE_OPTIONS.filter((o) => config.enabledServices.includes(o.value)),
    [config.enabledServices],
  );

  // Funnel analytics: one event per step reached, so drop-off is visible.
  useEffect(() => {
    track("step_viewed", { step });
    if (step === "estimate") {
      track("quote_shown", {
        min: quote?.min ?? null,
        max: quote?.max ?? null,
      });
    }
    // Only fire on step change; quote is stable by the time it's shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Accessibility: move focus into each new step so keyboard / screen-reader
  // users follow along instead of being stranded on the previous step. The
  // address step focuses its own input, so leave it be there.
  useEffect(() => {
    if (step === "address") return;
    const root = bodyRef.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>("h1") ??
      root.querySelector<HTMLElement>("[data-step-focus]");
    target?.focus({ preventScroll: true });
  }, [step]);

  function selectAndAdvance(patch: Partial<QuoteFlowAnswers>) {
    if (
      !mapsEnabled &&
      (patch.jobType === "full_replacement" ||
        patch.jobType === "flat_roof_replacement" ||
        patch.jobType === "gutters_fascias_soffits")
    ) {
      patch = {
        ...patch,
        fallbackReason:
          "Interactive roof measurement isn't available right now, so your roofer will price this after a quick call.",
      };
    }
    dispatch({ type: "PATCH", patch });
    clearAdvanceTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      dispatch({ type: "GO_NEXT" });
    }, ADVANCE_DELAY_MS);
  }

  function updateAddressLine(line: string) {
    dispatch({
      type: "PATCH",
      patch: { address: { ...answers.address, line } },
    });
  }

  function continueFromAddress() {
    clearAdvanceTimer();
    const postcode = looksLikeUkPostcode(answers.address.postcode)
      ? prettyPostcode(answers.address.postcode)
      : answers.address.postcode.trim();
    const line = answers.address.line.trim();
    if (!addressEntryReady(postcode) || !line) return;

    // The user types the full first line, so "14 Elm Grove, M1 2AB" is already
    // a complete, contactable address, set it directly. (ADDRESS_RESOLVED
    // below deliberately does NOT overwrite this with the reverse-geocoded
    // street, which would duplicate the road name.)
    dispatch({
      type: "PATCH",
      patch: {
        address: {
          ...answers.address,
          postcode,
          line,
          formatted: `${line}, ${postcode}`,
        },
      },
    });

    if (returnToLocate) {
      setReturnToLocate(false);
      dispatch({ type: "GO_TO", step: "locate" });
      return;
    }
    dispatch({ type: "GO_NEXT" });
  }

  function updatePostcode(postcode: string) {
    const postcodeChanged =
      normalisePostcode(postcode) !==
      normalisePostcode(answers.address.postcode);
    if (postcodeChanged) {
      setMapView(null);
      setPrefetchedGeocode(null);
    }
    dispatch({
      type: "PATCH",
      patch: {
        address: {
          ...answers.address,
          postcode,
          // A reverse-geocoded address belongs to the pin for the old postcode.
          formatted: postcodeChanged ? null : answers.address.formatted,
        },
        ...(postcodeChanged
          ? {
              coords: null,
              scan: null,
              fallbackReason: null,
              roofs: [],
              gutterRuns: [],
              chimneyCount: 0,
              rooflightCount: 0,
            }
          : {}),
      },
    });
  }

  async function submitLead(
    contact: QuoteFlowAnswers["contact"],
    otherJobDescription: string,
    botCheck: { hp: string; elapsedMs: number },
  ) {
    const merged: QuoteFlowAnswers = {
      ...answers,
      contact,
      otherJobDescription,
    };
    dispatch({ type: "SUBMIT_START", patch: { contact, otherJobDescription } });
    // The consultation path ("request my call back") is already an explicit
    // ask, so it lands hot. The quote path only saw a ballpark so far, it's a
    // "priced only" lead until they request an exact quote on the next step.
    const intent =
      flowPath(merged) === "consultation"
        ? "callback_requested"
        : "estimate_viewed";
    const payload = buildLeadPayload(
      merged,
      measurement,
      computeFlowQuote(merged, measurement, config),
      intent,
      mapView,
      config,
    );
    // Anti-spam signals travel alongside the payload; the backend silently
    // drops obvious bots (honeypot filled, or submitted implausibly fast).
    // `_submissionId` is generated once per session and reused for retries /
    // resend-on-mount AND the later intent promotion, the backend upserts on
    // it, so none of those turn one submission into duplicate rows.
    submissionIdRef.current ??= newSubmissionId();
    const body = {
      ...payload,
      _hp: botCheck.hp,
      _elapsedMs: botCheck.elapsedMs,
      _submissionId: submissionIdRef.current,
    };

    // Stash before sending so a reload/crash mid-send doesn't lose the lead;
    // cleared only once the backend confirms.
    savePendingLead(body);
    const result = await postLeadWithRetry(body);

    if (result.ok) {
      track("lead_submitted", {
        jobType: payload.jobType,
        leadType: payload.leadType,
      });
      dispatch({ type: "SUBMIT_DONE" });
    } else {
      // Pending lead is already cleared on permanent (4xx) failure inside
      // postLeadWithRetry; transient failures keep it for flush-on-mount.
      track("lead_failed", { retriable: result.retriable });
      dispatch({ type: "SUBMIT_ERROR", message: result.message });
    }
  }

  // Fired when someone clicks "Request my exact quote" on the post-estimate
  // step. Re-posts the SAME submission with a raised intent; the backend
  // upserts on the id and only ever raises intent, so this promotes the
  // existing "priced only" lead to "quote requested" (and notifies the roofer)
  // rather than creating a second row. Optimistic + best-effort.
  async function promoteToQuoteRequested() {
    if (intentPromoted || !submissionIdRef.current) return;
    setIntentPromoted(true);
    const payload = buildLeadPayload(
      answers,
      measurement,
      computeFlowQuote(answers, measurement, config),
      "quote_requested",
      mapView,
      config,
    );
    const body = {
      ...payload,
      _hp: "",
      _elapsedMs: Date.now() - flowMountedAtRef.current,
      _submissionId: submissionIdRef.current,
    };
    const result = await postLeadWithRetry(body);
    if (result.ok) {
      track("lead_quote_requested", { jobType: payload.jobType });
    } else {
      // Don't surface an error, the priced lead is already captured; leave the
      // button in its confirmed state rather than bouncing the user back.
      track("lead_promote_failed", { retriable: result.retriable });
    }
  }

  const sequence = stepSequence(answers);
  const percent = progressPercent(answers, step);
  const showBack =
    step !== "locate" &&
    sequence.indexOf(step) > 0 &&
    !(step === "consultation") &&
    !(step === "quote_next" && intentPromoted);
  const path = flowPath(answers);

  const jobLabel =
    jobTypeOptions.find((option) => option.value === answers.jobType)?.label ??
    JOB_TYPE_OPTIONS.find((option) => option.value === answers.jobType)
      ?.label ??
    "Roof work";
  const roofPaths = answers.roofs.map((roof) => roof.path);

  function renderStep() {
    switch (step) {
      case "address":
        return (
          <AddressStep
            postcode={answers.address.postcode}
            addressLine={answers.address.line}
            onPostcodeChange={updatePostcode}
            onAddressLineChange={updateAddressLine}
            onContinue={continueFromAddress}
          />
        );
      case "job_type":
        return (
          <OptionListStep
            heading="What does the roof need?"
            options={
              jobTypeOptions.length > 0 ? jobTypeOptions : JOB_TYPE_OPTIONS
            }
            selected={answers.jobType}
            onSelect={(jobType) => selectAndAdvance({ jobType })}
            callout="This decides how we price your job, replacements are measured from satellite, smaller jobs are priced by your roofer."
          />
        );
      case "property_type":
        return (
          <OptionListStep
            heading="What type of property is it?"
            options={PROPERTY_TYPE_OPTIONS}
            selected={answers.propertyType}
            onSelect={(propertyType) =>
              // Bungalows skip the storeys question, so answer it here.
              selectAndAdvance(
                propertyType === "bungalow"
                  ? { propertyType, storeys: 1 }
                  : { propertyType },
              )
            }
            callout="This helps us model scaffold access for your quote."
            twoCol
          />
        );
      case "storeys":
        return (
          <OptionListStep
            heading="How many storeys is your home?"
            options={STOREY_OPTIONS}
            selected={answers.storeys}
            onSelect={(storeys) => selectAndAdvance({ storeys })}
            callout="Roof access changes the price, taller homes usually need scaffolding for longer."
            twoCol
          />
        );
      case "locate":
        return (
          <LocateStep
            postcode={answers.address.postcode}
            mapView={mapView}
            onMapViewChange={setMapView}
            prefetched={
              prefetchedGeocode?.key === addressKey
                ? {
                    coords: prefetchedGeocode.coords,
                    formatted: prefetchedGeocode.formatted,
                  }
                : null
            }
            previousScan={
              answers.scan && answers.coords
                ? {
                    coords: answers.coords,
                    scan: answers.scan,
                    formatted: answers.address.formatted,
                  }
                : null
            }
            onSuccess={(coords, formatted, scan) =>
              dispatch({ type: "SCAN_SUCCESS", coords, formatted, scan })
            }
            onFallback={(coords, formatted, reason) =>
              dispatch({ type: "SCAN_FALLBACK", coords, formatted, reason })
            }
            onAddressResolved={(coords, formatted) =>
              dispatch({
                type: "ADDRESS_RESOLVED",
                postcode: answers.address.postcode,
                coords,
                formatted,
              })
            }
            // Repair prices off the size the customer picks, not measured area,
            // so the pin is for coordinates only — no Solar call.
            /* Neither a repair nor a driveway is measured from the roof, so
               neither runs the Solar scan. A driveway job was showing
               "Measuring your roof…" and spending a Solar call on a building
               nobody had asked about. */
            pinOnly={path === "repair" || path === "driveway"}
            subject={path === "driveway" ? "driveway" : "roof"}
            onPinConfirmed={(coords, formatted) =>
              dispatch({ type: "PIN_CONFIRMED", coords, formatted })
            }
            onEditAddress={() => {
              clearAdvanceTimer();
              setMapView(null);
              setReturnToLocate(true);
              dispatch({ type: "GO_TO", step: "address" });
            }}
          />
        );
      case "affected_area":
        if (!answers.coords) return null;
        return (
          <AffectedAreaStep
            coords={answers.coords}
            initialPath={answers.affectedArea}
            mapView={mapView}
            onMapViewChange={setMapView}
            onContinue={(affectedArea) => {
              dispatch({ type: "PATCH", patch: { affectedArea } });
              dispatch({ type: "GO_NEXT" });
            }}
            onSkip={() => {
              dispatch({ type: "PATCH", patch: { affectedArea: null } });
              dispatch({ type: "GO_NEXT" });
            }}
          />
        );
      case "driveway_surface":
        return (
          <OptionListStep
            heading="What's the drive made of?"
            sub="It changes the method as much as the price."
            options={DRIVEWAY_SURFACE_OPTIONS}
            selected={answers.drivewaySurface}
            onSelect={(drivewaySurface) =>
              selectAndAdvance({ drivewaySurface })
            }
            twoCol
          />
        );
      case "driveway_area":
        if (!answers.coords) return null;
        return (
          <AffectedAreaStep
            coords={answers.coords}
            initialPath={answers.drivewayArea}
            mapView={mapView}
            onMapViewChange={setMapView}
            hint="Drag the corners onto your driveway"
            doneLabel="Save the driveway and continue"
            skipLabel="I'd rather someone called"
            fillColor="#2f7d4f"
            // Bigger than a damage patch: roughly a single drive, 3m × 6m.
            initialBox={(centre) => defaultAffectedAreaBox(centre, 1.5, 3)}
            // The area is the whole price here, so show it while they drag.
            footnote={(path) => {
              const m2 = polygonAreaM2(path);
              if (m2 <= 0) return null;
              return isPlausibleDrivewayAreaM2(m2)
                ? `About ${Math.round(m2)}m²`
                : `${Math.round(m2)}m² — that doesn't look like a driveway`;
            }}
            onContinue={(drivewayArea) => {
              dispatch({ type: "PATCH", patch: { drivewayArea } });
              dispatch({ type: "GO_NEXT" });
            }}
            onSkip={() => {
              // No shape, no area, no price — hand it to a human instead.
              dispatch({
                type: "PATCH",
                patch: {
                  drivewayArea: null,
                  fallbackReason:
                    "We could not measure the driveway, so your quote will come from a quick call instead.",
                },
              });
              dispatch({ type: "GO_NEXT" });
            }}
          />
        );
      case "driveway_sealing":
        return (
          <OptionListStep
            heading="Seal it after cleaning?"
            sub="A second visit once the drive has dried. Keeps it clean for longer."
            options={[
              { value: "yes", label: "Yes, seal it", hint: "Adds to the price" },
              { value: "no", label: "Just clean it", hint: "" },
            ]}
            selected={answers.drivewaySealing ? "yes" : "no"}
            onSelect={(value) =>
              selectAndAdvance({ drivewaySealing: value === "yes" })
            }
            twoCol
          />
        );
      case "draw_roof":
        if (!answers.scan) return null;
        if (approach === "gutter_lines") {
          return (
            <GutterLineStep
              scan={answers.scan}
              areaM2={
                path !== "roofline" && measurement
                  ? Math.round(measurement.surfaceAreaM2)
                  : null
              }
              runs={answers.gutterRuns}
              chimneyCount={answers.chimneyCount}
              rooflightCount={answers.rooflightCount}
              showObstructionCounts={path !== "roofline"}
              continueDisabled={
                path === "roofline" && answers.gutterRuns.length === 0
              }
              onRunsChange={(gutterRuns) =>
                dispatch({ type: "PATCH", patch: { gutterRuns } })
              }
              onChimneyCountChange={(chimneyCount) =>
                dispatch({ type: "PATCH", patch: { chimneyCount } })
              }
              onRooflightCountChange={(rooflightCount) =>
                dispatch({ type: "PATCH", patch: { rooflightCount } })
              }
              onContinue={() => dispatch({ type: "GO_NEXT" })}
              mapView={mapView}
              onMapViewChange={setMapView}
            />
          );
        }
        return (
          <DrawRoofStep
            scan={answers.scan}
            roofs={answers.roofs}
            measurement={measurement}
            mode="roof"
            onRoofsChange={(roofs) =>
              dispatch({ type: "PATCH", patch: { roofs } })
            }
            onContinue={() => dispatch({ type: "GO_NEXT" })}
            mapView={mapView}
            onMapViewChange={setMapView}
          />
        );
      case "roofline_scope":
        return (
          <OptionListStep
            heading="What do you need replacing?"
            options={ROOFLINE_SCOPE_OPTIONS}
            selected={answers.rooflineScope}
            onSelect={(rooflineScope) => selectAndAdvance({ rooflineScope })}
            callout="Length comes from the gutter lines you marked."
          />
        );
      case "repair_size":
        return (
          <RepairSizeStep
            bands={REPAIR_BANDS}
            selected={answers.repairBandId}
            onSelect={(repairBandId) => selectAndAdvance({ repairBandId })}
          />
        );
      case "material":
        return (
          <MaterialStep
            options={materialOptionsFor(answers.jobType, config)}
            selected={answers.material}
            onSelect={(material) => selectAndAdvance({ material })}
          />
        );
      case "photos":
        return (
          <PhotosStep
            jobType={answers.jobType ?? ""}
            photos={photos}
            onChange={setPhotos}
            busy={grading}
            onContinue={() => void submitPhotos()}
            onSkip={skipPhotos}
          />
        );
      case "contact":
        return (
          <ContactStep
            jobType={answers.jobType}
            // The very next step renders `quote ? <Estimate/> : <Fallback/>`,
            // so this is the same question, answered from the same value.
            hasEstimate={quote !== null}
            initial={answers.contact}
            initialOtherDescription={answers.otherJobDescription}
            fallbackReason={answers.fallbackReason}
            busy={state.submitStatus === "busy"}
            error={state.submitError}
            onSubmit={(contact, otherJobDescription, botCheck) =>
              void submitLead(contact, otherJobDescription, botCheck)
            }
            onSkipToEstimate={() => dispatch({ type: "GO_NEXT" })}
          />
        );
      case "estimate":
        return quote ? (
          <EstimateStep
            quote={quote}
            measurement={measurement}
            roofs={roofPaths}
            address={displayAddress(answers.address)}
            materialLabelText={
              path === "roofline"
                ? answers.rooflineScope === "gutters_fascias"
                  ? "Gutters + fascias"
                  : "Gutters"
                : materialLabel(answers.material)
            }
            jobLabel={jobLabel}
            contactName={answers.contact.name}
            severity={answers.severity}
            brandName={brandName}
            mapsEnabled={mapsEnabled}
            // "Get my exact quote" leads to the next screen where they arrange
            // the visit, it doesn't commit here (that would overpromise an
            // instant exact quote). The real intent signal is "Arrange a visit".
            onConfirm={() => dispatch({ type: "GO_NEXT" })}
            // "Just send me the estimate for now" is the browser exit: the
            // estimate is emailed to them on lead creation, so just close.
            onContinue={() =>
              onClose ? onClose() : dispatch({ type: "GO_NEXT" })
            }
          />
        ) : (
          <ConsultationStep name={answers.contact.name} jobLabel={jobLabel} />
        );
      case "quote_next":
        return (
          <QuoteNextStep
            contactName={answers.contact.name}
            brandName={brandName}
            requested={intentPromoted}
            onRequest={() => void promoteToQuoteRequested()}
          />
        );
      case "consultation":
        return (
          <ConsultationStep name={answers.contact.name} jobLabel={jobLabel} />
        );
    }
  }

  return (
    <div
      className={`quote-surface relative ${
        variant === "card"
          ? "quote-card-shell overflow-hidden bg-transparent"
          : // Mobile fullscreen portal locks document scroll. Use a hard dvh
            // shell + scrollable body so CTAs below tall maps are never clipped
            // with nowhere to scroll (iPhone “no Done button” reports).
            "flex h-dvh max-h-dvh flex-col overflow-hidden bg-white"
      }`}
    >
      <ProgressHeader
        percent={percent}
        brandName={brandName}
        onClose={onClose}
      />
      {/* The panel is a fixed-height viewport in the card (embed) variant. The
          step fills it (flex chain: this area -> step -> StepShell), so short
          steps can center their content and map steps can fill to the edges,
          instead of sitting top-aligned with blank space below. Overflow-auto
          is a safety net for anything taller than the fixed panel. Page
          (mobile fullscreen) must also scroll inside this shell — the host
          document is overflow:hidden while the flow is open. */}
      <div
        ref={bodyRef}
        className={`quote-flow-scroller relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden ${
          variant === "card" ? "[scrollbar-gutter:stable]" : ""
        }`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={step}
            className={
              variant === "card" ||
              step === "locate" ||
              step === "affected_area" ||
              step === "draw_roof"
                ? "flex min-h-0 flex-1 flex-col"
                : undefined
            }
            initial={
              step === "locate" ||
              step === "affected_area" ||
              step === "draw_roof"
                ? false
                : { opacity: 0 }
            }
            animate={{ opacity: 1 }}
            exit={
              step === "locate" ||
              step === "affected_area" ||
              step === "draw_roof"
                ? undefined
                : { opacity: 0 }
            }
            transition={
              step === "locate" ||
              step === "affected_area" ||
              step === "draw_roof"
                ? { duration: 0 }
                : STEP_TRANSITION
            }
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* Pinned outside the scroll area so it stays put while the step body
          scrolls (absolute to the shell, which is position:relative). */}
      {showBack ? (
        <BackButton
          onClick={() => {
            clearAdvanceTimer();
            dispatch({ type: "GO_BACK" });
          }}
        />
      ) : null}
    </div>
  );
}

/** Standalone flow with its own Google Maps provider. */
export function QuoteFlow(props: QuoteFlowProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  if (!apiKey) return <QuoteFlowInner {...props} mapsEnabled={false} />;
  return (
    <APIProvider
      apiKey={apiKey}
      region="GB"
      language="en-GB"
      solutionChannel="belpa-flow"
    >
      <QuoteFlowInner {...props} mapsEnabled />
    </APIProvider>
  );
}
