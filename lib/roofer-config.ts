import { apiUrl } from "@/lib/api";
import {
  defaultQuoteConfig,
  parseQuoteConfig,
  type QuoteConfig,
} from "@/lib/quote-config";

export type RooferPublic = {
  slug: string;
  name: string;
  config: QuoteConfig;
};

/** Fetch public branding + quote config for a slug. */
export async function fetchRooferConfig(
  slug: string,
  init?: RequestInit,
): Promise<RooferPublic | null> {
  try {
    const res = await fetch(
      apiUrl(`/api/roofer?slug=${encodeURIComponent(slug)}`),
      { next: { revalidate: 120 }, ...init },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      roofer?: { slug: string; name: string };
      config?: unknown;
    };
    if (!body.roofer?.slug) return null;
    return {
      slug: body.roofer.slug,
      name: body.roofer.name,
      config: body.config
        ? parseQuoteConfig(body.config)
        : defaultQuoteConfig(),
    };
  } catch {
    return null;
  }
}
