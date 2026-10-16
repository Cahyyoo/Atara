import { describe, expect, it } from "vitest";
import { leadTimeHours, moistureContent, smRatio, stageMoments, weighingProblem } from "@/modules/lab/lib/records/mc";
import { WEIGHTS_SHEET_KEYS, weightsHeader } from "@/modules/lab/lib/records/weights-paste";
import { spreadPaste } from "@/modules/lab/lib/records/sheet-paste";

/** The figures the Formulir Analysis Result works out, checked against the lab's own sheet. */

describe("moistureContent", () => {
  it("is (W0 - Wd) * 100 / (W0 - Wp), as the form's MC column", () => {
    // Row 11 of the lab's sheet: Wp 579.0, W0 2810.0, Wd 1922.0 -> 39.80.
    expect(moistureContent(579, 2810, 1922)!.toFixed(2)).toBe("39.80");
    expect(moistureContent(564.5, 3131.5, 2276)!.toFixed(2)).toBe("33.33");
  });

  it("waits for all three weights, and never divides by nothing", () => {
    expect(moistureContent(579, 2810, null)).toBeNull();
    expect(moistureContent(null, 2810, 1922)).toBeNull();
    expect(moistureContent(500, 500, 500)).toBeNull();
  });
});

describe("smRatio", () => {
  it("is SiO2 over MgO", () => {
    expect(smRatio(33.02, 8.37)!.toFixed(2)).toBe("3.95");
  });

  it("is empty without MgO", () => {
    expect(smRatio(33.02, 0)).toBeNull();
    expect(smRatio(33.02, null)).toBeNull();
    expect(smRatio(null, 8.37)).toBeNull();
  });
});

describe("leadTimeHours", () => {
  const wita = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2025, 11, day, hour - 8, minute));

  it("counts the hours from receipt to the report, to one decimal", () => {
    expect(leadTimeHours(wita(17, 9), wita(19, 13))).toBe(52);
    expect(leadTimeHours(wita(17, 9), wita(17, 10, 20))).toBe(1.3);
  });

  it("is empty until both have happened, or when they run backwards", () => {
    expect(leadTimeHours(wita(17, 9), null)).toBeNull();
    expect(leadTimeHours(undefined, wita(19, 9))).toBeNull();
    expect(leadTimeHours(wita(19, 9), wita(17, 9))).toBeNull();
  });
});

describe("stageMoments", () => {
  const at = (hour: number) => new Date(Date.UTC(2025, 11, 17, hour));
  const ids = { receivedId: "rec", wetPrepId: "wet", reportId: "rep" };

  it("keeps the first receipt and wet preparation, and the last report", () => {
    const moments = stageMoments(
      [
        { stageId: "rep", scannedAt: at(9) },
        { stageId: "wet", scannedAt: at(3) },
        { stageId: "rec", scannedAt: at(1) },
        { stageId: "wet", scannedAt: at(5) },
        { stageId: "rec", scannedAt: at(2) },
        { stageId: "rep", scannedAt: at(7) },
      ],
      ids
    );
    expect(moments).toEqual({ receivedAt: at(1), wetPrepAt: at(3), reportAt: at(9) });
  });

  it("leaves a stage never scanned empty", () => {
    expect(stageMoments([{ stageId: "rec", scannedAt: at(1) }], ids)).toEqual({
      receivedAt: at(1),
      wetPrepAt: null,
      reportAt: null,
    });
  });
});

describe("weighingProblem", () => {
  it("accepts a sensible weighing, and one still being filled in", () => {
    expect(weighingProblem(579, 2810, 1922)).toBeNull();
    expect(weighingProblem(579, null, null)).toBeNull();
  });

  it("refuses a wet sample no heavier than its pan, or a dry one outside the two", () => {
    expect(weighingProblem(600, 600, 600)).toMatch(/W0/);
    expect(weighingProblem(579, 2810, 2900)).toMatch(/Wd/);
    expect(weighingProblem(579, 2810, 500)).toMatch(/Wd/);
  });
});

describe("pasting weighings into the sheet", () => {
  const target = (start = { row: 0, col: 0 }) => ({
    visible: [...WEIGHTS_SHEET_KEYS],
    known: [...WEIGHTS_SHEET_KEYS],
    start,
    rawDates: true,
    readHeader: weightsHeader,
  });
  const cells = (text: string, start?: { row: number; col: number }) =>
    spreadPaste(text, target(start)).writes.map(({ row, key, value }) => `${row}:${key}=${value}`);

  it("lays a block without a header down from the box it was pasted into", () => {
    expect(cells("MOL/SAP/A4/PA11/B78/779.1\t564.5\t3131.5\t2276\n")).toEqual([
      "0:sampleIdent=MOL/SAP/A4/PA11/B78/779.1",
      "0:wp=564.5",
      "0:w0=3131.5",
      "0:wd=2276",
    ]);
    expect(cells("583,5\t3073,5", { row: 2, col: 1 })).toEqual(["2:wp=583,5", "2:w0=3073,5"]);
  });

  it("finds the columns by their header, in any order, and takes Wo and Lab Code", () => {
    expect(cells("Wd\tSample ID\tW0\tWp\n2276,0\tA/1\t3.131,5\t564,5\n")).toEqual([
      "0:wd=2276,0",
      "0:sampleIdent=A/1",
      "0:w0=3.131,5",
      "0:wp=564,5",
    ]);
    expect(weightsHeader(["Lab Code", "Wo"])).toEqual([
      { index: 0, key: "sampleIdent" },
      { index: 1, key: "w0" },
    ]);
    expect(weightsHeader(["A/1", "564.5"])).toBeNull();
  });

  it("leaves a blank weight out, so the stored one stays", () => {
    expect(cells("A/1\t564.5\t\t2276")).toEqual(["0:sampleIdent=A/1", "0:wp=564.5", "0:wd=2276"]);
  });
});
