import { describe, expect, it } from "vitest";
import {
  LAB_RECORD_EXPORT_COLUMNS,
  SAMPLE_EXPORT_COLUMNS,
  defaultExportSelection,
  parseExportColumns,
  sheetColumnsFor,
  stageCells,
  stageColumnKey,
} from "@/lib/export-columns";
import { stageTimeline } from "@/lib/stage-timeline";

/**
 * Choosing the columns of an export, and the time a sample spent in each
 * stage -- the rules, without a database or a screen.
 */

const STAGES = [
  { id: "s1", name: "Preparation" },
  { id: "s2", name: "Analysis" },
];
const at = (hours: number) => new Date(Date.UTC(2026, 9, 5, 0, 0) + hours * 3_600_000);

describe("stageTimeline", () => {
  const logs = [
    { stageId: "s2", scannedAt: at(5.5), operator: "Budi" },
    { stageId: "s1", scannedAt: at(2), operator: "Ani" },
  ];

  it("gives each stage its entry, its operator and the hours until the next scan", () => {
    const visits = stageTimeline(logs, { now: at(8), completed: false });
    expect(visits.get("s1")).toEqual({ at: at(2), hours: 3.5, by: "Ani" });
    // The stage it is in now runs until now.
    expect(visits.get("s2")).toEqual({ at: at(5.5), hours: 2.5, by: "Budi" });
  });

  it("leaves the last stage of a finished sample without a duration", () => {
    expect(stageTimeline(logs, { now: at(8), completed: true }).get("s2")?.hours).toBeNull();
  });

  it("keeps the last visit when a correction sent the sample back", () => {
    const visits = stageTimeline(
      [...logs, { stageId: "s1", scannedAt: at(6), operator: "Citra" }],
      { now: at(7), completed: false }
    );
    expect(visits.get("s1")).toEqual({ at: at(6), hours: 1, by: "Citra" });
    expect(visits.get("s2")?.hours).toBe(0.5);
  });
});

describe("parseExportColumns", () => {
  const ids = STAGES.map((stage) => stage.id);

  it("gives the sheet the export always gave when nothing was chosen", () => {
    expect(parseExportColumns(null, SAMPLE_EXPORT_COLUMNS, ids)).toEqual([
      "sampleCode",
      "labCode",
      "sampleIdent",
      "currentStage",
      "status",
      "createdBy",
      "createdAt",
      "updatedAt",
    ]);
    const labRecords = parseExportColumns(null, LAB_RECORD_EXPORT_COLUMNS, ids);
    expect(labRecords).not.toContain("pit");
    expect(labRecords.slice(0, 3)).toEqual(["labCode", "sampleIdent", "sampleCode"]);
  });

  it("keeps the sheet's order, puts the stages after the sample, and drops what it does not know", () => {
    const raw = ["ni", stageColumnKey("s2", "by"), "pit", "labCode", "nonsense", stageColumnKey("gone", "at"), stageColumnKey("s1", "at")].join(",");
    expect(parseExportColumns(raw, LAB_RECORD_EXPORT_COLUMNS, ids)).toEqual([
      "labCode",
      stageColumnKey("s1", "at"),
      stageColumnKey("s2", "by"),
      "pit",
      "ni",
    ]);
  });

  it("starts the reader on the old sheet plus each stage's entry and hours", () => {
    const keys = defaultExportSelection(SAMPLE_EXPORT_COLUMNS, ids);
    expect(keys).toContain(stageColumnKey("s1", "at"));
    expect(keys).toContain(stageColumnKey("s2", "duration"));
    expect(keys).not.toContain(stageColumnKey("s1", "by"));
  });

  it("heads each stage column by its stage, and fills it from the timeline", () => {
    const keys = ["sampleCode", stageColumnKey("s1", "at"), stageColumnKey("s1", "duration"), stageColumnKey("s2", "by")];
    expect(sheetColumnsFor(keys, SAMPLE_EXPORT_COLUMNS, STAGES).map((column) => column.header)).toEqual([
      "Barcode Code",
      "Entered Preparation",
      "Hours in Preparation",
      "Operator Analysis",
    ]);

    const visits = stageTimeline([{ stageId: "s1", scannedAt: at(2), operator: "Ani" }], {
      now: at(4),
      completed: false,
    });
    expect(stageCells(keys, visits, (date) => date.toISOString())).toEqual({
      [stageColumnKey("s1", "at")]: at(2).toISOString(),
      [stageColumnKey("s1", "duration")]: 2,
      // Never reached: empty, not zero.
      [stageColumnKey("s2", "by")]: null,
    });
  });
});
