import { describe, expect, it } from "vitest";
import { formatGradeGroups, parseGradeGroups } from "@/modules/lab/lib/analytics/grade-groups";

describe("grade groups in the address", () => {
  it("reads one or several, in a fixed order, and falls back to Pit", () => {
    expect(parseGradeGroups("rockType,pit")).toEqual(["pit", "rockType"]);
    expect(parseGradeGroups("barging,pit")).toEqual(["pit", "barging"]);
    expect(formatGradeGroups(["barging", "pit"])).toBe("pit,barging");
    expect(parseGradeGroups("pit,pit,bogus")).toEqual(["pit"]);
    expect(parseGradeGroups("")).toEqual(["pit"]);
    expect(parseGradeGroups(null)).toEqual(["pit"]);
    expect(formatGradeGroups(["nonProd", "sir"])).toBe("sir,nonProd");
  });
});
