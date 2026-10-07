import { describe, expect, it } from "vitest";
import { isSamplePagePath, nextOrigin } from "@/lib/sample-origin";

/**
 * "Kembali" on a sample's pages returns to the list they were opened from,
 * however many of the sample's own pages were visited in between.
 */

describe("isSamplePagePath", () => {
  it("knows a sample's pages from the modules that share their prefix", () => {
    expect(isSamplePagePath("/samples/SMPL-2026-00099")).toBe(true);
    expect(isSamplePagePath("/samples/SMPL-2026-00099/sub/-20")).toBe(true);
    expect(isSamplePagePath("/samples/SMPL-2026-00099?tab=x")).toBe(true);
    expect(isSamplePagePath("/samples/labels")).toBe(false);
    expect(isSamplePagePath("/samples/generate")).toBe(false);
    expect(isSamplePagePath("/assay")).toBe(false);
  });
});

describe("nextOrigin", () => {
  it("remembers the list, filters and all, on stepping onto a sample's pages", () => {
    expect(nextOrigin("/assay?results=missing", "/samples/SMPL-1")).toBe("/assay?results=missing");
    expect(nextOrigin("/database", "/samples/SMPL-1/sub/-20")).toBe("/database");
  });

  it("keeps it while moving among the sample's pages", () => {
    expect(nextOrigin("/samples/SMPL-1", "/samples/SMPL-1/sub/-20")).toBeNull();
    expect(nextOrigin("/samples/SMPL-1/sub/-20", "/samples/SMPL-1")).toBeNull();
  });

  it("leaves it alone away from sample pages, or with nothing to go on", () => {
    expect(nextOrigin("/assay", "/database")).toBeNull();
    expect(nextOrigin(null, "/samples/SMPL-1")).toBeNull();
    // Labels is a module: leaving it for a sample makes it the origin.
    expect(nextOrigin("/samples/labels", "/samples/SMPL-1")).toBe("/samples/labels");
  });
});
