import { describe, expect, it } from "vitest";
import { draftRows, mergeDraft } from "@/modules/eksplorasi/components/sheet/sheet-draft";
import { settleRows } from "@/modules/eksplorasi/components/sheet/use-sheet-autosave";
import { SHEET_BLANK_ROWS, type SheetRow } from "@/modules/eksplorasi/components/sheet/sheet-rows";

/** A sheet's draft and its autosave's answer, without a browser. */

const loaded = (id: string, sampleId: string, ni = "1.5"): SheetRow => ({
  id,
  locked: true,
  original: { sampleId, ni },
  cells: { sampleId, ni },
});

describe("a sheet's draft", () => {
  it("keeps only the work: new rows with something in them, and changed samples", () => {
    const rows: SheetRow[] = [
      loaded("r1", "S-1"),
      { ...loaded("r2", "S-2"), locked: false, cells: { sampleId: "S-2", ni: "1.9" } },
      { ...loaded("r3", "S-3"), locked: false },
      { locked: false, cells: { sampleId: "S-NEW" } },
      { locked: false, cells: {} },
    ];
    expect(draftRows(rows)).toEqual([
      { id: "r2", original: { sampleId: "S-2", ni: "1.5" }, cells: { sampleId: "S-2", ni: "1.9" } },
      { cells: { sampleId: "S-NEW" } },
    ]);
  });

  it("puts a changed sample's boxes back on it, unlocked, against what the server holds now", () => {
    const merged = mergeDraft([loaded("r1", "S-1", "2.0")], [{ id: "r1", original: { sampleId: "S-1", ni: "1.5" }, cells: { sampleId: "S-1", ni: "1.9" } }]);
    expect(merged[0]).toEqual({ id: "r1", locked: false, original: { sampleId: "S-1", ni: "2.0" }, cells: { sampleId: "S-1", ni: "1.9" } });
  });

  it("brings a changed sample no longer among the latest below them, then the new rows, then the empty rows", () => {
    const merged = mergeDraft(
      [loaded("r1", "S-1")],
      [{ cells: { sampleId: "S-NEW" } }, { id: "r0", original: { sampleId: "S-0" }, cells: { sampleId: "S-0", ni: "3" } }]
    );
    expect(merged.slice(0, 3)).toEqual([
      loaded("r1", "S-1"),
      { id: "r0", locked: false, original: { sampleId: "S-0" }, cells: { sampleId: "S-0", ni: "3" } },
      { locked: false, cells: { sampleId: "S-NEW" } },
    ]);
    expect(merged).toHaveLength(3 + SHEET_BLANK_ROWS);
  });

  it("leaves the sheet as loaded without a draft", () => {
    expect(mergeDraft([loaded("r1", "S-1")], [])).toHaveLength(1 + SHEET_BLANK_ROWS);
  });
});

describe("an autosave's answer", () => {
  it("gives a new row its id and an unlocked sample what was sent as stored, keeping what was typed since", () => {
    const changed: SheetRow = { ...loaded("r1", "S-1"), locked: false, cells: { sampleId: "S-1", ni: "1.9" } };
    const added: SheetRow = { locked: false, cells: { sampleId: "S-2" } };
    const sent = [changed, added];
    const now: SheetRow[] = [changed, { locked: false, cells: { sampleId: "S-2", ni: "0.5" } }];

    const settled = settleRows(now, sent, new Map([[2, "new-2"]]), new Set([1]));
    expect(settled[0]).toEqual({ ...changed, original: { sampleId: "S-1", ni: "1.9" } });
    expect(settled[1]).toEqual({ id: "new-2", locked: false, original: { sampleId: "S-2" }, cells: { sampleId: "S-2", ni: "0.5" } });
  });

  it("leaves a row emptied since the send alone", () => {
    const sent: SheetRow[] = [{ locked: false, cells: { sampleId: "S-2" } }];
    const settled = settleRows([{ locked: false, cells: {} }], sent, new Map([[1, "new-1"]]), new Set());
    expect(settled[0]).toEqual({ locked: false, cells: {} });
  });
});
