import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isExactMatch,
  LOOKUP_MAX_RESULTS,
  normalizeLookupQuery,
  rankLookupMatches,
} from "@/lib/sample-lookup";

const row = (sampleCode: string, labCode: string | null = null, sampleIdent: string | null = null) => ({
  sampleCode,
  labCode,
  sampleIdent,
});

describe("normalizeLookupQuery", () => {
  it("trims and folds inner whitespace", () => {
    expect(normalizeLookupQuery("  AT  0001 ")).toBe("AT 0001");
  });

  it("refuses anything under two characters", () => {
    expect(normalizeLookupQuery("")).toBeNull();
    expect(normalizeLookupQuery(" A ")).toBeNull();
    expect(normalizeLookupQuery(null)).toBeNull();
  });

  it("caps a pasted wall of text", () => {
    expect(normalizeLookupQuery("x".repeat(500))).toHaveLength(64);
  });
});

describe("rankLookupMatches", () => {
  it("puts the exact barcode first, then exact lab code, then prefix, then contains", () => {
    const ranked = rankLookupMatches("ab12", [
      row("ZZ9", null, "MOL-AB12-SAP"),
      row("AB123"),
      row("QQ1", "ab12"),
      row("AB12"),
    ]);
    expect(ranked.map((r) => r.sampleCode)).toEqual(["AB12", "QQ1", "AB123", "ZZ9"]);
  });

  it("lists each sample once, and at most eight", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`AT${String(i).padStart(3, "0")}`));
    const ranked = rankLookupMatches("AT", [...rows, rows[0]]);
    expect(ranked).toHaveLength(LOOKUP_MAX_RESULTS);
    expect(new Set(ranked.map((r) => r.sampleCode)).size).toBe(LOOKUP_MAX_RESULTS);
  });

  it("knows an exact hit from a near one, ignoring case", () => {
    expect(isExactMatch("at0001", row("AT0001"))).toBe(true);
    expect(isExactMatch("AT000", row("AT0001"))).toBe(false);
  });

  /**
   * A stored Sample ID writes its leading group with spaces; someone reading
   * one off an older sheet types slashes throughout. A whole id in either hand
   * is the exact hit that sends the box straight to the sample, so the ident
   * is scored as a key rather than as text.
   */
  it("reads a whole Sample ID as exact in either hand", () => {
    const sample = row("AT0001", "SPR.QLAB.20260917.001", "LAM SAP S4/B24/3475.3");
    expect(isExactMatch("LAM SAP S4/B24/3475.3", sample)).toBe(true);
    expect(isExactMatch("LAM/SAP/S4/B24/3475.3", sample)).toBe(true);
    expect(isExactMatch("lam sap s4 b24 3475.3", sample)).toBe(true);
    expect(isExactMatch("LAM SAP S4/B24/3475", sample)).toBe(false);
  });

  it("ranks a piece of one ahead of an unrelated sample, in either hand", () => {
    const sample = row("AT0001", null, "LAM SAP S4/B24/3475.3");
    // Sorted before it on the tie-break, so only the score can lift AT0001.
    const other = row("AT0000", null, "MOL LIM S3/PA4/B42/919.3");
    for (const typed of ["SAP/S4", "SAP S4", "s4/b24", "3475.3"]) {
      expect(rankLookupMatches(typed, [other, sample])[0].sampleCode, typed).toBe("AT0001");
      expect(isExactMatch(typed, sample), typed).toBe(false);
    }
  });
});

describe("where it is enforced", () => {
  it("needs a session and never finds a deleted sample", () => {
    const route = readFileSync(
      join(process.cwd(), "src", "app", "api", "samples", "lookup", "route.ts"),
      "utf8"
    );
    expect(route).toContain("requireSession(request)");
    expect(route.match(/\.\.\.ACTIVE_SAMPLE/g)).toHaveLength(2);
  });
});
