import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  detectCsvDelimiter,
  readDataSourceSheet,
  readDateCell,
  readSampleTypeCell,
  type Cell,
  type SheetLine,
} from "@/modules/eksplorasi/lib/data-source-import";
import {
  DATA_SOURCE_VIEWS,
  ELEMENT_FIELDS,
  fieldForHeader,
  viewColumns,
  viewFields,
  viewOf,
  viewOfType,
  VIEWS,
} from "@/modules/eksplorasi/lib/data-source-columns";
import { parseCsv } from "@/core/lib/sheets/csv-parse";

const sheet = (...rows: Cell[][]): SheetLine[] => rows.map((cells, index) => ({ line: index + 1, cells }));

describe("the lists' columns", () => {
  it("are the lab's sheets: each list's own columns, then the sixteen elements", () => {
    expect(VIEWS.dataSource.leading).toEqual(["campaign", "holeId", "sampleId", "sampleType", "from", "to", "date", "weight"]);
    expect(VIEWS.standard.leading).toEqual(["control", "campaign", "holeId", "sampleId", "remarks", "date", "weight"]);
    expect(VIEWS.blank.leading).toEqual(["control", "campaign", "holeId", "sampleId", "sampleType", "remarks", "date", "weight"]);
    expect(VIEWS.duplicate.leading).toEqual([
      "controlDate",
      "control",
      "campaign",
      "no",
      "holeId",
      "sampleId",
      "sampleType",
      "remarks",
      "date",
      "weight",
    ]);
    for (const view of DATA_SOURCE_VIEWS) expect(viewFields(view).slice(-16)).toEqual([...ELEMENT_FIELDS]);
  });

  it("hold each QC list to one type, and send each type to its list", () => {
    expect(DATA_SOURCE_VIEWS.map((view) => VIEWS[view].sampleType)).toEqual([null, "STANDARD", "BLANK", "DUPLICATE"]);
    expect(viewOfType("BLANK")).toBe("blank");
    expect(viewOfType("ORIGINAL")).toBe("dataSource");
    expect(viewOf("duplicate")).toBe("duplicate");
    expect(viewOf("drilling")).toBe("dataSource");
    expect(viewOf(null)).toBe("dataSource");
  });

  it("read back every header each list's export writes", () => {
    for (const view of DATA_SOURCE_VIEWS) {
      for (const column of viewColumns(view)) expect(fieldForHeader(column.header), column.header).toBe(column.key);
    }
  });

  it("read the usual spellings, whatever the case or unit", () => {
    expect(fieldForHeader("Ni (%)")).toBe("ni");
    expect(fieldForHeader("FE2O3")).toBe("fe2o3");
    expect(fieldForHeader("BHID")).toBe("holeId");
    expect(fieldForHeader("From (m)")).toBe("from");
    expect(fieldForHeader("Tanggal")).toBe("date");
    expect(fieldForHeader("CRM")).toBe("control");
    expect(fieldForHeader("Tipe Sampel")).toBe("sampleType");
    expect(fieldForHeader("Geologist")).toBeNull();
  });
});

describe("a cell", () => {
  it("reads ISO and day-first dates, workbook dates and Excel serials", () => {
    expect(readDateCell("2026-10-01")).toBe("2026-10-01");
    expect(readDateCell("01/10/2026")).toBe("2026-10-01");
    expect(readDateCell("2026-10-01 08:30")).toBe("2026-10-01");
    expect(readDateCell(new Date(Date.UTC(2026, 9, 1)))).toBe("2026-10-01");
    expect(readDateCell(46296)).toBe("2026-10-01");
    expect(readDateCell("31/02/2026")).toBe("invalid");
    expect(readDateCell(null)).toBeNull();
  });

  it("reads a sample type as its code or the words the lab uses", () => {
    expect(readSampleTypeCell("Standart")).toBe("STANDARD");
    expect(readSampleTypeCell("Standard (CRM)")).toBe("STANDARD");
    expect(readSampleTypeCell("crm")).toBe("STANDARD");
    expect(readSampleTypeCell("BLK")).toBe("BLANK");
    expect(readSampleTypeCell("dup")).toBe("DUPLICATE");
    expect(readSampleTypeCell("Sampel biasa")).toBe("ORIGINAL");
    expect(readSampleTypeCell("")).toBeNull();
    expect(readSampleTypeCell("reference")).toBe("invalid");
  });
});

describe("readDataSourceSheet", () => {
  it("takes the first non-blank line as the header and ignores what it does not know", () => {
    const read = readDataSourceSheet(
      sheet([], ["Sample ID", "Sample Type", "Geologist", "Ni"], ["S-1", "Original", "Budi", "1.5"], [], ["S-2", "Blank", "", ""])
    );
    expect(read).toMatchObject({ ok: true, total: 2, invalid: 0, ignoredHeaders: ["Geologist"] });
    if (!read.ok) return;
    expect(read.rows).toEqual([
      { line: 3, data: { sampleId: "S-1", sampleType: "ORIGINAL", ni: "1.5" } },
      { line: 5, data: { sampleId: "S-2", sampleType: "BLANK", ni: null } },
    ]);
  });

  it("keeps a value as written, and a workbook number without its binary tail", () => {
    const read = readDataSourceSheet(sheet(["Sample ID", "Sample Type", "Ni", "SiO2"], ["S-1", "ORIGINAL", 0.1 + 0.2, "<0.01"]));
    expect(read.ok && read.rows[0].data).toMatchObject({ ni: "0.3", sio2: "<0.01" });
  });

  it("gives a QC list's rows its type, and refuses a row of another", () => {
    const read = readDataSourceSheet(sheet(["Sample ID", "Sample Type"], ["S-1", ""], ["S-2", "CRM"], ["S-3", "Blank"]), "STANDARD");
    expect(read.ok && read.rows.map((row) => [row.data.sampleId, row.data.sampleType])).toEqual([
      ["S-1", "STANDARD"],
      ["S-2", "STANDARD"],
    ]);
    expect(read.ok && read.errors.map(({ line, field }) => [line, field])).toEqual([[4, "sampleType"]]);
    // A QC list's file may leave the column out altogether.
    const bare = readDataSourceSheet(sheet(["Sample ID"], ["S-9"]), "DUPLICATE");
    expect(bare.ok && bare.rows[0].data.sampleType).toBe("DUPLICATE");
  });

  it("reports every bad row, with its line and column, and keeps the good ones", () => {
    const read = readDataSourceSheet(
      sheet(
        ["Sample ID", "Sample Type", "Date", "Ni"],
        ["S-1", "Original", "2026-01-01", "1.2"],
        ["S-2", "", "", ""],
        ["S-3", "Original", "soon", ""],
        ["", "Original", "", ""],
        ["S-5", "Original", "", "x".repeat(21)]
      )
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.rows.map((row) => row.data.sampleId)).toEqual(["S-1"]);
    expect(read.invalid).toBe(4);
    expect(read.errors.map(({ line, field }) => [line, field])).toEqual([
      [3, "sampleType"],
      [4, "date"],
      [5, "sampleId"],
      [6, "ni"],
    ]);
  });

  it("refuses a sample ID the file already used, whatever its case", () => {
    const read = readDataSourceSheet(sheet(["Sample ID"], ["S-1"], [" s-1 "], ["S-2"]), "BLANK");
    expect(read.ok && read.rows.map((row) => row.data.sampleId)).toEqual(["S-1", "S-2"]);
    expect(read.ok && read.errors).toEqual([
      { line: 3, sampleId: "s-1", field: "sampleId", message: 'Sample ID "s-1" already appears on line 2.' },
    ]);
  });

  it("says why it cannot read a sheet at all", () => {
    expect(readDataSourceSheet(sheet([], [""]))).toEqual({ ok: false, error: "empty" });
    expect(readDataSourceSheet(sheet(["Hole ID", "Ni"], ["A", "1"]))).toEqual({ ok: false, error: "noSampleId" });
    expect(readDataSourceSheet(sheet(["Sample ID", "Ni"], ["A", "1"]))).toEqual({ ok: false, error: "noSampleType" });
    const tooMany = sheet(["Sample ID"], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`S${i}`]));
    expect(readDataSourceSheet(tooMany, "BLANK")).toEqual({ ok: false, error: "tooMany" });
  });
});

describe("a CSV's separator", () => {
  it("is found on the header line, outside quotes", () => {
    expect(detectCsvDelimiter("Sample ID,Ni\nS-1,1")).toBe(",");
    expect(detectCsvDelimiter("﻿Sample ID;Ni;Fe\nS-1;1,5;40")).toBe(";");
    expect(detectCsvDelimiter("Sample ID\tNi\nS-1\t1")).toBe("\t");
    expect(detectCsvDelimiter('"Blok A, utara";Sample ID\n')).toBe(";");
  });

  it("reads a semicolon CSV from an Indonesian Excel end to end", () => {
    const text = "Sample ID;Sample Type;Ni;Tanggal\r\nS-1;Duplicate;1,25;01/10/2026\r\n";
    const rows = parseCsv(text, detectCsvDelimiter(text), true);
    const read = readDataSourceSheet(rows.map((cells, index) => ({ line: index + 1, cells })));
    expect(read.ok && read.rows[0].data).toEqual({ sampleId: "S-1", sampleType: "DUPLICATE", ni: "1,25", date: "2026-10-01" });
  });
});
