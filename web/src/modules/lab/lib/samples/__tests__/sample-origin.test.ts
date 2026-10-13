import { describe, expect, it } from "vitest";
import { isSamplePagePath, nextOrigin } from "@/modules/lab/lib/samples/sample-origin";

/**
 * "Kembali" on a sample's pages returns to the list they were opened from,
 * however many of the sample's own pages were visited in between.
 */

describe("isSamplePagePath", () => {
  it("knows a sample's pages from the modules that share their prefix", () => {
    expect(isSamplePagePath("/lab/samples/SMPL-2026-00099")).toBe(true);
    expect(isSamplePagePath("/lab/samples/SMPL-2026-00099/sub/-20")).toBe(true);
    expect(isSamplePagePath("/lab/samples/SMPL-2026-00099?tab=x")).toBe(true);
    expect(isSamplePagePath("/lab/samples/labels")).toBe(false);
    expect(isSamplePagePath("/lab/samples/generate")).toBe(false);
    expect(isSamplePagePath("/lab/assay")).toBe(false);
  });
});

describe("nextOrigin", () => {
  it("remembers the list, filters and all, on stepping onto a sample's pages", () => {
    expect(nextOrigin("/lab/assay?results=missing", "/lab/samples/SMPL-1")).toBe("/lab/assay?results=missing");
    expect(nextOrigin("/lab/database", "/lab/samples/SMPL-1/sub/-20")).toBe("/lab/database");
  });

  it("keeps it while moving among the sample's pages", () => {
    expect(nextOrigin("/lab/samples/SMPL-1", "/lab/samples/SMPL-1/sub/-20")).toBeNull();
    expect(nextOrigin("/lab/samples/SMPL-1/sub/-20", "/lab/samples/SMPL-1")).toBeNull();
  });

  it("leaves it alone away from sample pages, or with nothing to go on", () => {
    expect(nextOrigin("/lab/assay", "/lab/database")).toBeNull();
    expect(nextOrigin(null, "/lab/samples/SMPL-1")).toBeNull();
    // Labels is a module: leaving it for a sample makes it the origin.
    expect(nextOrigin("/lab/samples/labels", "/lab/samples/SMPL-1")).toBe("/lab/samples/labels");
  });
});
