import { describe, expect, it } from "vitest";

import {
  extractPostcode,
  looksLikeUkPostcode,
  normalisePostcode,
  postcodeError,
  prettyPostcode,
} from "@/lib/postcode";
import { addressEntryReady } from "@/components/quote/AddressEntry";

describe("postcode helpers", () => {
  it("normalises and pretty-prints UK postcodes", () => {
    expect(normalisePostcode("sw1a 2aa")).toBe("SW1A2AA");
    expect(prettyPostcode("sw1a2aa")).toBe("SW1A 2AA");
    expect(looksLikeUkPostcode("SW1A 2AA")).toBe(true);
    expect(looksLikeUkPostcode("GIR 0AA")).toBe(true);
    expect(looksLikeUkPostcode("SW1A")).toBe(false);
    expect(looksLikeUkPostcode("not a postcode")).toBe(false);
  });

  it("requires a valid postcode before continue", () => {
    expect(addressEntryReady("SW1A 2AA")).toBe(true);
    expect(addressEntryReady("GIR 0AA")).toBe(true);
    expect(addressEntryReady("SW1A")).toBe(false);
    expect(addressEntryReady("not a postcode")).toBe(false);
  });
});

describe("pasted addresses", () => {
  it("finds the postcode wherever it sits in the line", () => {
    // The reported bug: a tester pasted postcode + first line and was told to
    // "Enter a valid UK postcode". The postcode was right there.
    expect(extractPostcode("HP13 5BP, 8 MAITLAND DRIVE")).toBe("HP135BP");
    expect(extractPostcode("8 Maitland Drive, HP13 5BP")).toBe("HP135BP");
    expect(extractPostcode("Flat 2, 14 High St, SW1A 1AA")).toBe("SW1A1AA");
    expect(extractPostcode("  hp13   5bp  ")).toBe("HP135BP");
    expect(extractPostcode("GIR 0AA")).toBe("GIR0AA");
  });

  it("still rejects text with no postcode in it", () => {
    expect(extractPostcode("8 MAITLAND DRIVE")).toBeNull();
    expect(extractPostcode("not an address")).toBeNull();
    expect(extractPostcode("")).toBeNull();
  });

  it("takes the trailing postcode, since UK addresses end with one", () => {
    expect(extractPostcode("M1 1AE, forwarded from EC1A 1BB")).toBe("EC1A1BB");
  });

  it("displays the postcode rather than the mangled address", () => {
    expect(prettyPostcode("HP13 5BP, 8 MAITLAND DRIVE")).toBe("HP13 5BP");
  });
});

describe("postcode error messages", () => {
  it("says what is actually wrong, not one message for everything", () => {
    expect(postcodeError("")).toBe("Enter your postcode");
    expect(postcodeError("   ")).toBe("Enter your postcode");
    // Stopped part-way — needs another character, not a correction.
    expect(postcodeError("HP13")).toBe("Almost — add the rest of your postcode");
    expect(postcodeError("HP13 5B")).toBe("Almost — add the rest of your postcode");
    expect(postcodeError("8 Maitland Drive")).toBe(
      "That doesn\u2019t look like a UK postcode",
    );
  });

  it("accepts anything containing a postcode", () => {
    expect(postcodeError("HP13 5BP")).toBeNull();
    expect(postcodeError("HP13 5BP, 8 MAITLAND DRIVE")).toBeNull();
  });

  it("keeps every message short enough to sit under the field", () => {
    for (const v of ["", "HP13", "asdf"]) {
      expect(postcodeError(v)!.length).toBeLessThanOrEqual(40);
    }
  });
});
