/**
 * Client for POST /api/severity.
 *
 * Multipart rather than JSON because the lead endpoint caps bodies at 64KB,
 * two orders of magnitude below a phone photo. `multipart/form-data` is a
 * CORS-safelisted content type, so this needs no extra preflight headers.
 *
 * Never throws and never rejects. A failure here resolves to a null severity,
 * which prices identically to "the customer skipped this step" — grading is an
 * enhancement to the estimate, never a gate on getting one.
 */
import { apiUrl } from "@/lib/api";
import type { DamageSeverity } from "@/lib/types";

const TIMEOUT_MS = 25_000;

export type SeverityUploadResult = {
  severity: DamageSeverity | null;
  photoPaths: string[];
};

const EMPTY: SeverityUploadResult = { severity: null, photoPaths: [] };

export async function uploadAndGrade(
  photos: File[],
  jobType: string,
  rooferId: string,
  submissionId: string,
): Promise<SeverityUploadResult> {
  if (photos.length === 0) return EMPTY;

  const form = new FormData();
  form.set("jobType", jobType);
  form.set("rooferId", rooferId);
  form.set("submissionId", submissionId);
  for (const photo of photos) form.append("photos", photo);

  try {
    const response = await fetch(apiUrl("/api/severity"), {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return EMPTY;

    const body = (await response.json()) as {
      severity?: unknown;
      confidence?: unknown;
      visibleIssues?: unknown;
      photoPaths?: unknown;
    };

    const photoPaths = Array.isArray(body.photoPaths)
      ? body.photoPaths.filter((p): p is string => typeof p === "string")
      : [];

    // Re-validate rather than trusting the response shape: this value moves a
    // price, and the widget is the last place it can be rejected cheaply.
    const score = body.severity;
    const confidence = body.confidence;
    const usable =
      typeof score === "number" &&
      Number.isInteger(score) &&
      score >= 1 &&
      score <= 5 &&
      (confidence === "medium" || confidence === "high");

    if (!usable) return { severity: null, photoPaths };

    return {
      severity: {
        score: score as DamageSeverity["score"],
        confidence,
        visibleIssues: Array.isArray(body.visibleIssues)
          ? body.visibleIssues.filter((v): v is string => typeof v === "string")
          : [],
        model: "server",
      },
      photoPaths,
    };
  } catch {
    return EMPTY;
  }
}
