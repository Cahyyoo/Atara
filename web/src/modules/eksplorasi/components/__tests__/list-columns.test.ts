import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARRANGEABLE,
  DEFAULT_VISIBLE,
  alignOf,
  arrangeColumns,
  columnWidths,
  defaultColumns,
  isCompact,
  listColumns,
} from "@/modules/eksplorasi/components/list-columns";
import { DATA_SOURCE_VIEWS, ELEMENT_FIELDS, VIEWS } from "@/modules/eksplorasi/lib/data-source-columns";

describe("a list's columns on screen", () => {
  it("start on the row number, join From and To on the data source, and end on the buttons", () => {
    expect(listColumns("dataSource").slice(0, 9)).toEqual([
      "rowNo",
      "campaign",
      "holeId",
      "sampleId",
      "sampleType",
      "fromTo",
      "date",
      "weight",
      "ni",
    ]);
    for (const view of DATA_SOURCE_VIEWS) {
      expect(listColumns(view)[0]).toBe("rowNo");
      expect(listColumns(view).at(-1)).toBe("actions");
      expect(ARRANGEABLE[view]).not.toContain("rowNo");
    }
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
      expect(loading, view).toContain(`columns={${defaultColumns(view).length}}`);
    }
  });

  it("follow the order somebody dragged them into, show only those ticked, and keep the sample ID and the buttons", () => {
    const all = ARRANGEABLE.duplicate;
    expect(arrangeColumns("duplicate", [], all)).toEqual(listColumns("duplicate"));

    const columns = arrangeColumns("duplicate", ["ni", "gone", "sampleId", "control"], ["ni", "control", "campaign"]);
    // Unknown keys are dropped; columns the saved order does not name go back where they belong.
    expect(columns).toEqual(["rowNo", "ni", "sampleId", "control", "campaign", "actions"]);

    const total = columnWidths(columns).reduce((sum, width) => sum + parseFloat(width), 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it("open without the assay results, which are left for somebody to tick", () => {
    for (const view of DATA_SOURCE_VIEWS) {
      for (const element of ELEMENT_FIELDS) expect(DEFAULT_VISIBLE[view], view).not.toContain(element);
      expect(DEFAULT_VISIBLE[view], view).toContain("sampleId");
      const columns = defaultColumns(view);
      expect(columns.filter((column) => ARRANGEABLE[view].includes(column))).toEqual(DEFAULT_VISIBLE[view]);
      const total = columnWidths(columns).reduce((sum, width) => sum + parseFloat(width), 0);
      expect(total, view).toBeCloseTo(100, 1);
    }
  });

  it("read at a comfortable size by default, and tighten only when most elements are ticked on", () => {
    for (const view of DATA_SOURCE_VIEWS) {
      expect(isCompact(defaultColumns(view)), view).toBe(false);
      expect(isCompact(listColumns(view)), view).toBe(true);
    }
  });

  it("centre short marks and dates, put numbers right and words left", () => {
    for (const column of ["rowNo", "sampleType", "date", "controlDate", "no", "actions"] as const) {
      expect(alignOf(column), column).toBe("center");
    }
    for (const column of ["ni", "mc", "weight"] as const) expect(alignOf(column), column).toBe("right");
    for (const column of ["campaign", "sampleId", "remarks", "fromTo"] as const) expect(alignOf(column), column).toBe("left");
  });
});
