"use client";

import { useRef, useState } from "react";

import {
  AddressEntry,
  FieldFeedbackIcon,
  addressEntryReady,
  useConfirmingValid,
} from "@/components/quote/AddressEntry";
import { MaterialSwatch } from "@/components/quote/MaterialSwatch";
import {
  InfoCallout,
  OptionPill,
  PrimaryButton,
  StepHeading,
  StepShell,
  flowInputClass,
  flowLabelClass,
  useFlowVariant,
} from "@/components/quote/ui";
import type { MaterialOption } from "@/lib/materials";
import type { FlowOption, RepairBand } from "@/lib/quote-flow";
import type { ContactDetails, JobType, Material } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Generic option-list question (heatable-style)                       */
/* ------------------------------------------------------------------ */

export function OptionListStep<Value extends string | number>({
  heading,
  sub,
  options,
  selected,
  onSelect,
  callout,
  twoCol = false,
}: {
  heading: string;
  sub?: string;
  options: readonly FlowOption<Value>[];
  selected: Value | null;
  onSelect: (value: Value) => void;
  callout?: string;
  twoCol?: boolean;
}) {
  const variant = useFlowVariant();
  return (
    <StepShell>
      <StepHeading sub={sub} info={callout}>
        {heading}
      </StepHeading>
      <div
        className={`grid ${variant === "card" ? "gap-3.5" : "gap-3"} ${
          twoCol ? "sm:grid-cols-2" : "grid-cols-1"
        } ${variant === "card" ? "flex-1 content-center" : ""}`}
      >
        {options.map((option) => (
          <OptionPill
            key={String(option.value)}
            label={option.label}
            hint={option.hint}
            selected={selected === option.value}
            onClick={() => onSelect(option.value)}
          />
        ))}
      </div>
    </StepShell>
  );
}

/* ------------------------------------------------------------------ */
/* Address                                                             */
/* ------------------------------------------------------------------ */

export function AddressStep({
  postcode,
  addressLine,
  onPostcodeChange,
  onAddressLineChange,
  onContinue,
}: {
  postcode: string;
  addressLine: string;
  onPostcodeChange: (value: string) => void;
  onAddressLineChange: (value: string) => void;
  onContinue: () => void;
}) {
  const postcodeValid = addressEntryReady(postcode);
  // First line is required, it's the whole point: the roofer needs a
  // specific, contactable property, not just a postcode.
  const lineValid = addressLine.trim().length > 0;
  const lineFeedback = useConfirmingValid(addressLine, lineValid);
  const ready = postcodeValid && lineValid;
  return (
    <StepShell>
      <StepHeading info="Your postcode is only used to find your roof on recent aerial imagery.">
        Where&apos;s the roof?
      </StepHeading>
      <div className="space-y-6 text-left">
        <AddressEntry
          postcode={postcode}
          onPostcodeChange={onPostcodeChange}
          autoFocus={!postcodeValid}
          onSubmit={() => {
            if (ready) onContinue();
          }}
        />
        <div>
          <label className={flowLabelClass} htmlFor="quote-address-line">
            First line of address
          </label>
          <div className="relative">
            <input
              id="quote-address-line"
              type="text"
              value={addressLine}
              onChange={(event) => onAddressLineChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (ready) onContinue();
                }
              }}
              placeholder="e.g. 14 Elm Grove"
              autoComplete="address-line1"
              autoFocus={postcodeValid}
              aria-busy={lineFeedback === "checking"}
              className={`${flowInputClass} pr-11 ${
                lineFeedback === "checking" || lineFeedback === "valid"
                  ? "border-emerald-400/80 focus:border-emerald-400"
                  : ""
              }`}
            />
            <FieldFeedbackIcon status={lineFeedback} />
          </div>
        </div>
      </div>
      <PrimaryButton onClick={onContinue} disabled={!ready}>
        Continue
      </PrimaryButton>
    </StepShell>
  );
}

/* ------------------------------------------------------------------ */
/* Repair size                                                         */
/* ------------------------------------------------------------------ */

export function RepairSizeStep({
  bands,
  selected,
  onSelect,
}: {
  bands: RepairBand[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <OptionListStep
      heading="How big is the damaged area?"
      options={bands.map((band) => ({
        value: band.id,
        label: band.label,
        hint: band.hint,
      }))}
      selected={selected}
      onSelect={onSelect}
      callout="A rough size is fine, your roofer confirms the exact area before any work."
    />
  );
}

/* ------------------------------------------------------------------ */
/* Material (image tiles, greensky-style)                              */
/* ------------------------------------------------------------------ */

export function MaterialStep({
  options,
  selected,
  onSelect,
}: {
  options: MaterialOption[];
  selected: Material | null;
  onSelect: (value: Material) => void;
}) {
  const variant = useFlowVariant();
  return (
    <StepShell>
      <StepHeading
        sub="Not sure? Tap ‘Not sure’ and your roofer will confirm it."
        info="The covering changes material cost more than anything else in your estimate."
      >
        What&apos;s on the roof?
      </StepHeading>
      <div className={`grid grid-cols-2 sm:grid-cols-4 ${variant === "card" ? "gap-3" : "gap-2"}`}>
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              aria-pressed={isSelected}
              className={`group overflow-hidden rounded-2xl border bg-white p-2 text-center transition-colors duration-150 ${
                isSelected
                  ? "border-brand-500 shadow-[0_0_0_3px_rgba(47,107,255,0.2),0_10px_24px_-10px_rgba(31,87,240,0.5)]"
                  : "border-line hover:border-brand-300"
              }`}
            >
              <span className={`relative block overflow-hidden rounded-xl ${variant === "card" ? "h-20" : "h-20"}`}>
                <MaterialSwatch id={option.swatch} />
                {isSelected ? (
                  <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-brand-500 text-white shadow">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5"
                      aria-hidden="true"
                    >
                      <path d="M4 12.5 9.5 18 20 6.5" />
                    </svg>
                  </span>
                ) : null}
              </span>
              <span className={`mt-2 block font-semibold leading-tight text-ink ${variant === "card" ? "text-[13.5px]" : "text-[12px]"}`}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

/* ------------------------------------------------------------------ */
/* Contact (lead gate)                                                 */
/* ------------------------------------------------------------------ */

export function ContactStep({
  jobType,
  initial,
  initialOtherDescription,
  fallbackReason,
  busy,
  error,
  onSubmit,
  onSkipToEstimate,
}: {
  jobType: JobType | null;
  initial: ContactDetails;
  initialOtherDescription: string;
  fallbackReason: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (
    contact: ContactDetails,
    otherJobDescription: string,
    botCheck: { hp: string; elapsedMs: number },
  ) => void;
  onSkipToEstimate?: () => void;
}) {
  const variant = useFlowVariant();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [otherDescription, setOtherDescription] = useState(
    initialOtherDescription,
  );
  // Anti-spam: a hidden field bots tend to fill, plus how long the form was on
  // screen before submit. Both are sent to the backend, which silently drops
  // obvious bots (see /api/lead).
  const [honeypot, setHoneypot] = useState("");
  const mountedAtRef = useRef(Date.now());

  const phoneValid = /^[0-9+()\s-]{7,}$/.test(phone.trim());
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isQuotePath =
    jobType === "full_replacement" ||
    jobType === "flat_roof_replacement" ||
    jobType === "tile_or_slate_repair" ||
    jobType === "gutters_fascias_soffits";
  const showEstimateNext = isQuotePath && !fallbackReason;
  // On the estimate path the customer can have their estimate emailed to them,
  // so email is required here; the callback path keeps it optional.
  const emailRequired = showEstimateNext;
  const ready =
    name.trim().length >= 2 && phoneValid && (!emailRequired || emailValid);

  return (
    <StepShell
      className={
        variant === "card"
          ? // Short forms (everything but the tall "other" one, which has the
            // extra textarea) centre in the panel instead of hugging the top.
            // The "other" form stays top-anchored + scrollable so it can never
            // clip against the fixed panel.
            `!pt-5 overflow-y-auto ${jobType === "other" ? "" : "justify-center"}`
          : ""
      }
    >
      <StepHeading
        compact
        sub={
          showEstimateNext
            ? "Just need your details to send this over."
            : "Your local roofer will call you back."
        }
        info="Your details go straight to the roofer this widget belongs to, never sold on."
      >
        {showEstimateNext ? "Nearly there" : "Let's get you a call back"}
      </StepHeading>

      {fallbackReason ? <InfoCallout>{fallbackReason}</InfoCallout> : null}

      <form
        className={`mt-1 flex flex-col ${variant === "card" ? "gap-3" : "gap-4"}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || busy) return;
          onSubmit({ name, phone, email }, otherDescription, {
            hp: honeypot,
            elapsedMs: Date.now() - mountedAtRef.current,
          });
        }}
      >
        {/* Honeypot, hidden from humans, off the tab order and a11y tree.
            Bots that auto-fill every field will populate it and get dropped. */}
        <input
          type="text"
          name="company"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
        />
        <div className={variant === "card" ? "grid grid-cols-2 gap-3" : "contents"}>
        <div>
          <label className={flowLabelClass} htmlFor="contact-name">
            Full name
          </label>
          <input
            id="contact-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            className={flowInputClass}
          />
        </div>
        <div>
          <label className={flowLabelClass} htmlFor="contact-phone">
            Phone
          </label>
          <input
            id="contact-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            className={flowInputClass}
          />
        </div>
        </div>
        <div>
          <label className={flowLabelClass} htmlFor="contact-email">
            Email{" "}
            {emailRequired ? (
              <span className="font-normal text-muted">(we&apos;ll send your estimate here)</span>
            ) : (
              <span className="font-normal text-muted">(optional)</span>
            )}
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className={flowInputClass}
          />
        </div>
        {jobType === "other" ? (
          <div>
            <label className={flowLabelClass} htmlFor="contact-description">
              What do you need done?
            </label>
            <textarea
              id="contact-description"
              value={otherDescription}
              onChange={(event) => setOtherDescription(event.target.value)}
              rows={variant === "card" ? 2 : 3}
              className={`${flowInputClass} resize-none`}
            />
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-2xl bg-red-50 p-3.5 text-[14px] text-red-600"
          >
            {error}
          </p>
        ) : null}

        <PrimaryButton type="submit" disabled={!ready} busy={busy}>
          {showEstimateNext ? "Show my estimate" : "Request my call back"}
        </PrimaryButton>
        {process.env.NODE_ENV !== "production" && showEstimateNext ? (
          <button
            type="button"
            onClick={onSkipToEstimate}
            className="self-center text-[12px] font-semibold text-muted transition-colors hover:text-brand-600"
          >
            Show estimate without details (dev)
          </button>
        ) : null}
      </form>
    </StepShell>
  );
}

/* ------------------------------------------------------------------ */
/* Consultation confirmation (manual path terminal)                    */
/* ------------------------------------------------------------------ */

export function ConsultationStep({
  name,
  jobLabel,
}: {
  name: string;
  jobLabel: string;
}) {
  return (
    <StepShell>
      <div className="mt-6 grid place-items-center">
        <span className="grid size-16 place-items-center rounded-full bg-brand-50">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-8 text-brand-600"
            aria-hidden="true"
          >
            <path d="M4 12.5 9.5 18 20 6.5" />
          </svg>
        </span>
      </div>
      <StepHeading
        sub="Your roofer will call to arrange a quick look."
        info={`This kind of job (${jobLabel.toLowerCase()}) needs a quick look before pricing. Keep your phone handy, most call-backs happen within one working day.`}
      >
        Thanks{name ? `, ${name.split(" ")[0]}` : ""}, you&apos;re all set
      </StepHeading>
    </StepShell>
  );
}
