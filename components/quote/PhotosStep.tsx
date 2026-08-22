"use client";

/**
 * The damage-photo step. Optional by design: skipping it must leave the
 * estimate exactly as it was, so "Skip for now" is a first-class action rather
 * than a hidden escape hatch, and every failure path (compression, upload,
 * grading) silently behaves like a skip instead of blocking the customer.
 *
 * Layout deliberately mirrors MaterialStep's tile grid — same rounded-2xl
 * tiles, same brand-500 selected ring, same corner badge — so this reads as
 * another page of the same flow rather than a bolted-on uploader.
 */
import { Camera, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { compressImage, type CompressedPhoto } from "@/lib/image-compress";
import {
  PrimaryButton,
  StepHeading,
  StepShell,
  useFlowVariant,
} from "@/components/quote/ui";

export const MAX_PHOTOS = 5;

/** What the customer calls the thing they are photographing. */
const SUBJECT: Record<string, string> = {
  tile_or_slate_repair: "roof",
  gutters_fascias_soffits: "guttering",
  gutter_clearing: "guttering",
};

export function PhotosStep({
  jobType,
  photos,
  onChange,
  onContinue,
  onSkip,
  busy = false,
}: {
  jobType: string;
  photos: CompressedPhoto[];
  onChange: (next: CompressedPhoto[]) => void;
  onContinue: () => void;
  onSkip: () => void;
  busy?: boolean;
}) {
  const variant = useFlowVariant();
  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = SUBJECT[jobType] ?? "roof";
  const remaining = MAX_PHOTOS - photos.length;

  // Object URLs are per-photo and revoked on removal; this catches the case
  // where the customer leaves the step with photos still attached.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setError(null);
      setWorking(true);
      try {
        const accepted = Array.from(fileList)
          .filter((f) => f.type.startsWith("image/"))
          .slice(0, remaining);

        if (accepted.length < fileList.length) {
          setError(
            fileList.length > remaining
              ? `You can add up to ${MAX_PHOTOS} photos.`
              : "Those need to be image files.",
          );
        }

        const compressed = await Promise.all(accepted.map(compressImage));
        onChange([...photos, ...compressed]);
      } catch {
        setError("Sorry, those photos wouldn't load. You can skip this step.");
      } finally {
        setWorking(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onChange, photos, remaining],
  );

  const removeAt = (index: number) => {
    const next = [...photos];
    const [removed] = next.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    onChange(next);
  };

  return (
    <StepShell>
      <StepHeading
        sub="Make sure your photo clearly shows as much of the damage as possible."
        info="Photos let us judge how extensive the damage is, which tightens your estimate range. Without them you'll still get an estimate — just a wider one."
      >
        Could you add some photos of your {subject}?
      </StepHeading>

      <div
        className={`grid grid-cols-2 sm:grid-cols-3 ${
          variant === "card" ? "gap-3" : "gap-2"
        }`}
      >
        {photos.map((photo, index) => (
          <div
            key={photo.previewUrl}
            className="group relative overflow-hidden rounded-2xl border border-brand-500 bg-white p-2 shadow-[0_0_0_3px_rgba(47,107,255,0.2),0_10px_24px_-10px_rgba(31,87,240,0.5)]"
          >
            <span className="relative block h-20 overflow-hidden rounded-xl bg-black/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt={`Damage photo ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </span>
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label={`Remove photo ${index + 1}`}
              className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-ink/70 text-white shadow backdrop-blur-sm transition-colors hover:bg-ink"
            >
              <X strokeWidth={2.5} className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}

        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={working || busy}
            className="grid place-items-center rounded-2xl border border-dashed border-line bg-white p-2 transition-colors duration-150 hover:border-brand-300 disabled:opacity-50"
          >
            <span className="flex h-20 w-full flex-col items-center justify-center gap-1.5 text-muted">
              {working ? (
                <span className="size-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
              ) : (
                <>
                  {photos.length === 0 ? (
                    <Camera strokeWidth={1.75} className="size-6" aria-hidden="true" />
                  ) : (
                    <Plus strokeWidth={2} className="size-6" aria-hidden="true" />
                  )}
                  <span className="text-[12.5px] font-semibold">
                    {photos.length === 0 ? "Add photos" : "Add another"}
                  </span>
                </>
              )}
            </span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3.5 text-[14px] text-red-600">
          {error}
        </p>
      ) : null}

      <PrimaryButton
        onClick={onContinue}
        busy={busy}
        disabled={working || photos.length === 0}
      >
        {photos.length === 0
          ? "Continue"
          : `Continue with ${photos.length} photo${photos.length === 1 ? "" : "s"}`}
      </PrimaryButton>

      <button
        type="button"
        onClick={onSkip}
        disabled={busy}
        className="mx-auto mt-3 rounded-full border border-line bg-white px-7 py-3 text-[15px] font-semibold text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
      >
        Skip for now
      </button>
    </StepShell>
  );
}
