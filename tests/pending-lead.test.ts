import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_AGE_MS,
  clearPendingLead,
  flushPendingLead,
  newSubmissionId,
  postLeadWithRetry,
  savePendingLead,
} from "@/lib/pending-lead";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", {
    localStorage,
    setTimeout: (
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => globalThis.setTimeout(handler, timeout, ...args),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 500 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pending-lead", () => {
  it("exposes a 1-hour max age", () => {
    expect(MAX_AGE_MS).toBe(60 * 60 * 1000);
  });

  it("newSubmissionId returns a non-empty string", () => {
    expect(newSubmissionId().length).toBeGreaterThan(8);
  });

  it("clears the stash on successful submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    savePendingLead({ name: "Ada", _submissionId: "abc" });
    expect(store.has("belpa_pending_lead")).toBe(true);

    const result = await postLeadWithRetry({ name: "Ada" });
    expect(result.ok).toBe(true);
    expect(store.has("belpa_pending_lead")).toBe(false);
  });

  it("clears the stash on permanent 4xx failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "bad" }), { status: 400 }),
      ),
    );
    savePendingLead({ name: "Ada" });

    const result = await postLeadWithRetry({ name: "Ada" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retriable).toBe(false);
    expect(store.has("belpa_pending_lead")).toBe(false);
  });

  it("keeps the stash on transient failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    savePendingLead({ name: "Ada" });

    const result = await postLeadWithRetry({ name: "Ada" }, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retriable).toBe(true);
    expect(store.has("belpa_pending_lead")).toBe(true);
  });

  it("drops aged pending leads on flush", () => {
    store.set(
      "belpa_pending_lead",
      JSON.stringify({
        body: { name: "Ada" },
        savedAt: Date.now() - MAX_AGE_MS - 1,
      }),
    );
    flushPendingLead();
    expect(store.has("belpa_pending_lead")).toBe(false);
  });
});

describe("clearPendingLead", () => {
  it("removes the key", () => {
    savePendingLead({ name: "Ada" });
    clearPendingLead();
    expect(store.has("belpa_pending_lead")).toBe(false);
  });
});
