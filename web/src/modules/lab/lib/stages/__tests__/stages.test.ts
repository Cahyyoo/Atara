import { describe, expect, it } from "vitest";

import { STAGE_KEYS, stageLabel, type StageKey } from "@/modules/lab/lib/stages/stages";

/** Stands in for next-intl's `t`, which throws on a key it does not hold. */
const t = (key: StageKey) => {
  const words: Record<StageKey, string> = {
    RECEIVED: "DITERIMA",
    WET_PREP: "PREP BASAH",
    DRY_PREP: "PREP KERING",
    ANALYSIS: "ANALISA",
    REPORT: "REPORT",
  };
  const word = words[key];
  if (!word) throw new Error(`no message for ${key}`);
  return word;
};

describe("stageLabel", () => {
  it("says what the translation says for a key it knows", () => {
    expect(stageLabel(t, "RECEIVED", "DITERIMA")).toBe("DITERIMA");
    expect(stageLabel(t, "DRY_PREP", "PREP KERING")).toBe("PREP KERING");
  });

  /**
   * The reason the known list exists rather than handing the key straight to
   * `t`. A stage added later, or one whose key was typed by hand, would
   * otherwise throw on render and take the whole screen down — and the stored
   * name is right there, worth more than a blank page.
   */
  it("falls back to the stored name for a key nobody has translated", () => {
    expect(stageLabel(t, "PACKING", "Packing")).toBe("Packing");
    expect(() => stageLabel(t, "PACKING", "Packing")).not.toThrow();
  });

  it("falls back for a stage that carries no key at all", () => {
    expect(stageLabel(t, null, "Some Stage")).toBe("Some Stage");
    expect(stageLabel(t, undefined, "Some Stage")).toBe("Some Stage");
  });

  it("covers the whole workflow, so no stage is left to the fallback", () => {
    // If a key is ever added to the database without being added here, this is
    // what notices.
    expect(STAGE_KEYS).toEqual(["RECEIVED", "WET_PREP", "DRY_PREP", "ANALYSIS", "REPORT"]);
    for (const key of STAGE_KEYS) {
      expect(stageLabel(t, key, "unused fallback")).not.toBe("unused fallback");
    }
  });
});
