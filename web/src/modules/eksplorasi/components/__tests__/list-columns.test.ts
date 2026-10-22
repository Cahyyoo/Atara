import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARRANGEABLE, arrangeColumns, columnWidths, listColumns } from "@/modules/eksplorasi/components/list-columns";
import { DATA_SOURCE_VIEWS, VIEWS } from "@/modules/eksplorasi/lib/data-source-columns";

describe("a list's columns on screen", () => {
  it("join From and To on the data source, and end on the buttons", () => {
    expect(listColumns("dataSource").slice(0, 8)).toEqual([
      "campaign",
      "holeId",
      "sampleId",
      "sampleType",
      "fromTo",
      "date",
      "weight",
      "ni",
    ]);
    for (const view of DATA_SOURCE_VIEWS) expect(listColumns(view).at(-1)).toBe("actions");
  });

  it("share the whole width between them, so nothing scrolls sideways", () => {
    for (const view of DATA_SOURCE_VIEWS) {
      const total = columnWidths(listColumns(view)).reduce((sum, width) => sum + parseFloat(width), 0);
      expect(total, view).toBeCloseTo(100, 1);
    }
  });

  it("are as many as the page's skeleton draws, so the table does not jump when it lands", () => {
    for (const view of DATA_SOURCE_VIEWS) {
      const folder = VIEWS[view].path.split("/").at(-1)!;
      const loading = readFileSync(join(process.cwd(), "src", "app", "(app)", "eksplorasi", folder, "loading.tsx"), "utf8");
      expect(loading, view).toContain(`columns={${listColumns(view).length}}`);
    }
  });

  it("follow the order somebody dragged them into, show only those ticked, and keep the sample ID and the buttons", () => {
    const all = ARRANGEABLE.duplicate;
    expect(arrangeColumns("duplicate", [], all)).toEqual(listColumns("duplicate"));

    const columns = arrangeColumns("duplicate", ["ni", "gone", "sampleId", "control"], ["ni", "control", "campaign"]);
    // Unknown keys are dropped; columns the saved order does not name go back where they belong.
    expect(columns).toEqual(["ni", "sampleId", "control", "campaign", "actions"]);

    const total = columnWidths(columns).reduce((sum, width) => sum + parseFloat(width), 0);
    expect(total).toBeCloseTo(100, 1);
  });
});
