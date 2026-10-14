import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { arrangeReport, batchKey, siteName, type ReportRecord } from "@/modules/lab/lib/analytics/analysis-report";
import { buildAnalysisReport, type ReportColumn } from "@/modules/lab/lib/analytics/analysis-report-xlsx";
import { pngSize } from "@/core/lib/sheets/xlsx-brand";

/**
 * The Sample Database export as the lab's FORMULIR ANALYSIS RESULT: how the
 * samples are arranged, and the workbook that comes out, read back.
 */

function record(
  id: string,
  {
    site = "MOL",
    nonProd = null,
    group = "g1",
    sampleNo = 1,
    parentId = null,
    shiftDate = "2025-12-07",
    cells = {},
  }: Partial<ReportRecord> = {}
): ReportRecord {
  return { id, parentId, site, nonProd, group, shiftDate, sampleNo, label: `S/${group}/${sampleNo}${parentId ? " (-20)" : ""}`, cells };
}

describe("arrangeReport", () => {
  it("names the sites as the form does", () => {
    expect(siteName("MOL")).toBe("MOLORE");
    expect(siteName("lam")).toBe("LAMERURU");
    expect(siteName("XYZ")).toBe("XYZ");
    expect(siteName(null)).toBe("LAINNYA");
  });

  it("gives each site its own sheet, Molore first, named as the lab's tabs are", () => {
    const sheets = arrangeReport([record("l1", { site: "LAM", group: "lg" }), record("m1")]);
    expect(sheets.map((sheet) => [sheet.name, sheet.title])).toEqual([
      ["MOL. Prod.", "MOLORE PRODUCTION SAMPLE"],
      ["LAM. Prod.", "LAMERURU PRODUCTION SAMPLE"],
    ]);
  });

  it("reports each non-production code on a sheet of its own, after its site's production one", () => {
    const sheets = arrangeReport([
      record("m-tp", { nonProd: "TP", group: "gtp" }),
      record("l1", { site: "LAM", group: "lg" }),
      record("m1"),
      record("l-bg", { site: "LAM", nonProd: "BG", group: "gbg" }),
      record("m-bg", { nonProd: "BG", group: "gbg2" }),
    ]);
    expect(sheets.map((sheet) => sheet.name)).toEqual(["MOL. Prod.", "MOL. BG", "MOL. TP", "LAM. Prod.", "LAM. BG"]);
    expect(sheets.find((sheet) => sheet.name === "MOL. TP")!.title).toBe("MOLORE TP SAMPLE");
    // The production sheet no longer carries the non-production samples.
    const production = sheets.find((sheet) => sheet.name === "MOL. Prod.")!;
    expect(production.batches.flat().map((row) => row.id)).toEqual(["m1"]);
  });

  it("keeps a batch together in sample order, earliest batch first, each sub right after its sample", () => {
    const sheets = arrangeReport([
      record("b2", { group: "late", shiftDate: "2025-12-09", sampleNo: 1 }),
      record("a3", { sampleNo: 3 }),
      record("a1", { sampleNo: 1 }),
      record("a1-sub", { sampleNo: 1, parentId: "a1" }),
      record("a2", { sampleNo: 2 }),
    ]);
    expect(sheets[0].batches.map((batch) => batch.map((row) => row.id))).toEqual([
      ["a1", "a1-sub", "a2", "a3"],
      ["b2"],
    ]);
  });

  it("puts samples without an identity in batches of their own", () => {
    const base = { placeId: "p", rockTypeId: "r", nonProdId: null, sirId: "s", pitId: "t", bargingNo: "B78", sequenceNo: 779 };
    expect(batchKey({ id: "x", ...base })).toBe(batchKey({ id: "y", ...base, bargingNo: " b78 " }));
    expect(batchKey({ id: "x", ...base, sequenceNo: null })).toBe("single:x");
  });
});

describe("buildAnalysisReport", () => {
  const columns: ReportColumn[] = [
    { key: "rowNo", header: "No.", band: "sample" },
    { key: "sampleIdent", header: "Sample", band: "sample" },
    { key: "stage.s1.at", header: "Date", band: "stageAt", stageName: "Diterima" },
    { key: "stage.s2.at", header: "Date", band: "stageAt", stageName: "Prep Basah" },
    { key: "leadTime", header: "Days", band: "lead" },
    { key: "sio2", header: "SiO2 (%)", band: "results" },
    { key: "mgo", header: "MgO (%)", band: "results" },
    { key: "smRatio", header: "SM Ratio", band: "results" },
    { key: "mc", header: "MC", band: "results" },
    { key: "measurementMethod", header: "Application", band: "instrument" },
    { key: "preparator", header: "Preparator", band: "instrument" },
    { key: "xrayInstrument", header: "Xray Instrument", band: "instrument" },
    { key: "mcDate", header: "Tanggal", band: "mc" },
    { key: "wp", header: "Wp", band: "mc" },
    { key: "w0", header: "W0", band: "mc" },
    { key: "wd", header: "Wd", band: "mc" },
  ];
  const cells = (sio2: number, mgo: number, wp: number, w0: number, wd: number) => ({
    sampleIdent: `MOL SAP A4/PIT A11/B78/779.${wp}`,
    "stage.s1.at": new Date(Date.UTC(2025, 11, 7)),
    "stage.s2.at": new Date(Date.UTC(2025, 11, 17)),
    leadTime: 2,
    sio2,
    mgo,
    smRatio: sio2 / mgo,
    mc: ((w0 - wd) * 100) / (w0 - wp),
    measurementMethod: "STARGATE_LG-GEO",
    preparator: "Lab Analyst",
    xrayInstrument: "S2 PUMA",
    mcDate: new Date(Date.UTC(2025, 11, 17)),
    wp,
    w0,
    wd,
  });

  async function readBack(records: ReportRecord[], chosen = columns) {
    const buffer = await buildAnalysisReport({ sheets: arrangeReport(records), columns: chosen });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    return workbook;
  }

  it("heads the sheet like the form, with the site's title over the elements", async () => {
    const workbook = await readBack([record("a", { cells: cells(33.02, 8.37, 579, 2810, 1922) })]);
    const sheet = workbook.getWorksheet("MOL. Prod.")!;
    expect(sheet.getCell("C1").value).toBe("FORMULIR ANALYSIS RESULT");
    expect(sheet.getCell("C3").value).toBe("JENIS SAMPLE");
    expect(sheet.getCell("D4").value).toBe("PREP BASAH");
    expect(sheet.getCell("E3").value).toBe("LEAD TIME");
    expect(sheet.getCell("F3").value).toBe("MOLORE PRODUCTION SAMPLE");
    expect(sheet.getCell("J1").value).toBe("No. Dokumen");
    expect(sheet.getCell("M1").value).toBe("TABEL MC");
    expect(sheet.getRow(5).values).toEqual(
      expect.arrayContaining(["No.", "Sample", "SM Ratio", "MC", "Application", "Preparator", "Xray Instrument", "Wp", "W0", "Wd"])
    );
  });

  it("shows each stage's moment and the weighing with its time, not the day alone", async () => {
    const workbook = await readBack([record("a", { cells: cells(33.02, 8.37, 579, 2810, 1922) })]);
    const sheet = workbook.getWorksheet("MOL. Prod.")!;
    expect(sheet.getCell("C6").numFmt).toBe("d-mmm-yy hh:mm");
    expect(sheet.getCell("D6").numFmt).toBe("d-mmm-yy hh:mm");
    expect(sheet.getCell("M6").numFmt).toBe("d-mmm-yy hh:mm");
  });

  it("writes SM ratio and MC as formulas over the row's own cells, with their values", async () => {
    const workbook = await readBack([record("a", { cells: cells(33.02, 8.37, 579, 2810, 1922) })]);
    const sheet = workbook.getWorksheet("MOL. Prod.")!;
    expect(sheet.getCell("A6").value).toBe(1);
    expect(sheet.getCell("H6").value).toMatchObject({ formula: 'IFERROR(F6/G6,"")' });
    expect(sheet.getCell("I6").value).toMatchObject({ formula: 'IFERROR((O6-P6)*100/(O6-N6),"")' });
    expect(((sheet.getCell("I6").value as { result: number }).result).toFixed(2)).toBe("39.80");
    expect(sheet.getCell("K6").value).toBe("Lab Analyst");
  });

  it("closes a batch of two or more with its average, leaving the sub-sample out of it", async () => {
    const workbook = await readBack([
      record("a", { sampleNo: 1, cells: cells(30, 10, 500, 3000, 2000) }),
      record("a-sub", { sampleNo: 1, parentId: "a", cells: cells(90, 10, 500, 3000, 2000) }),
      record("b", { sampleNo: 2, cells: cells(40, 10, 500, 3000, 2500) }),
    ]);
    const sheet = workbook.getWorksheet("MOL. Prod.")!;
    // a, its sub (no number), b, then the average.
    expect([sheet.getCell("A6").value, sheet.getCell("A7").value, sheet.getCell("A8").value]).toEqual([1, null, 2]);
    expect(sheet.getCell("F9").value).toMatchObject({ formula: 'IFERROR(AVERAGE(F6,F8),"")', result: 35 });
    expect(sheet.getCell("H9").value).toMatchObject({ result: 3.5 });
    expect(sheet.getCell("F9").fill).toMatchObject({ fgColor: { argb: "FFB4C6E7" } });
  });

  it("closes a batch of one with its own average, so two batches never read as one group", async () => {
    // The case from the lab's own sheet: a single-sample batch above a batch
    // of two. Without a row of its own the first ran into the second.
    const workbook = await readBack([
      record("single", { group: "b464", shiftDate: "2025-12-06", cells: cells(30, 10, 500, 3000, 2000) }),
      record("pair-1", { group: "b489", sampleNo: 1, cells: cells(40, 10, 500, 3000, 2400) }),
      record("pair-2", { group: "b489", sampleNo: 2, cells: cells(50, 10, 500, 3000, 2600) }),
    ]);
    const sheet = workbook.getWorksheet("MOL. Prod.")!;
    // Row 6 the lone sample, row 7 its average, rows 8-9 the pair, row 10 theirs.
    expect([sheet.getCell("A6").value, sheet.getCell("A8").value, sheet.getCell("A9").value]).toEqual([1, 2, 3]);
    expect(sheet.getCell("F7").value).toMatchObject({ formula: 'IFERROR(AVERAGE(F6),"")', result: 30 });
    expect(sheet.getCell("F7").fill).toMatchObject({ fgColor: { argb: "FFB4C6E7" } });
    expect(sheet.getCell("F10").value).toMatchObject({ formula: 'IFERROR(AVERAGE(F8:F9),"")', result: 45 });
    expect(sheet.getCell("F10").fill).toMatchObject({ fgColor: { argb: "FFB4C6E7" } });
  });

  it("leaves out what was not chosen, and falls back to values when a formula's cells are missing", async () => {
    const chosen = columns.filter((column) => !["wp", "w0", "wd", "mgo", "preparator"].includes(column.key));
    const workbook = await readBack([record("a", { cells: cells(33.02, 8.37, 579, 2810, 1922) })], chosen);
    const sheet = workbook.getWorksheet("MOL. Prod.")!;
    const headers = (sheet.getRow(5).values as unknown[]).filter(Boolean);
    expect(headers).not.toContain("Wp");
    expect(headers).not.toContain("Preparator");
    const mcColumn = headers.indexOf("MC") + 1;
    expect(typeof sheet.getCell(6, mcColumn).value).toBe("number");
  });
});

describe("the form's logo", () => {
  const LOGO = readFileSync(join(process.cwd(), "public", "img", "logo_aspire.png"));
  const SAMPLE_COLUMNS: ReportColumn[] = [
    { key: "rowNo", header: "No.", band: "sample", width: 5 },
    { key: "sample", header: "Sample", band: "sample", width: 30 },
    { key: "ni", header: "Ni (%)", band: "results" },
  ];

  it("keeps its own proportions, centred in the No./Sample block, not stretched over it", async () => {
    const buffer = await buildAnalysisReport({ sheets: [], columns: SAMPLE_COLUMNS, logo: LOGO });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const [image] = workbook.worksheets[0].getImages();

    const { width: logoWidth, height: logoHeight } = pngSize(LOGO);
    // ExcelJS reads `ext` back but leaves it out of ImageRange.
    const ext = (image.range as typeof image.range & { ext?: { width: number; height: number } }).ext!;
    expect(ext).toBeDefined();
    expect(ext.width / ext.height).toBeCloseTo(logoWidth / logoHeight, 1);
    // Rows 1-4 at 18pt are 96px; the logo fits inside them.
    expect(ext.height).toBeLessThanOrEqual(96);
    // Centred across No. (5 -> 40px) and Sample (30 -> 215px): its left edge
    // is (255 - width) / 2 from A's, so inside B by that less A's 40px.
    const left = (255 - ext.width) / 2;
    expect(image.range.tl.nativeCol).toBe(1);
    expect(image.range.tl.nativeColOff / 9525).toBeCloseTo(left - 40, 0);
  });
});
