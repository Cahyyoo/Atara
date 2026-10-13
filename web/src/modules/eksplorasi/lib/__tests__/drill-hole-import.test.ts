import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  detectCsvDelimiter,
  readDateCell,
  readDrillHoleSheet,
  readNumberCell,
  readStatusCell,
  type Cell,
  type SheetLine,
} from "@/modules/eksplorasi/lib/drill-hole-import";
import { DRILL_HOLE_COLUMNS, fieldForHeader } from "@/modules/eksplorasi/lib/drill-hole-columns";
import { parseCsv } from "@/core/lib/sheets/csv-parse";

const sheet = (...rows: Cell[][]): SheetLine[] => rows.map((cells, index) => ({ line: index + 1, cells }));

describe("the drilling sheet's headers", () => {
  it("reads every header the export writes", () => {
    for (const column of DRILL_HOLE_COLUMNS) expect(fieldForHeader(column.header), column.header).toBe(column.key);
  });

  it("reads the Indonesian names and the usual spellings, whatever the case or unit", () => {
    expect(fieldForHeader("ELEVASI (m)")).toBe("elevation");
    expect(fieldForHeader("Kedalaman Total")).toBe("totalDepth");
    expect(fieldForHeader("tanggal mulai")).toBe("startDate");
    expect(fieldForHeader("Area / Prospek")).toBe("area");
    expect(fieldForHeader("BHID")).toBe("holeId");
    expect(fieldForHeader("Catatan")).toBe("remarks");
    expect(fieldForHeader("Geologist")).toBeNull();
  });
});

describe("a cell", () => {
  it("reads numbers with either decimal mark", () => {
    expect(readNumberCell("412345,125")).toBe(412345.125);
    expect(readNumberCell("1.234,5")).toBe(1234.5);
    expect(readNumberCell(-60)).toBe(-60);
    expect(readNumberCell("")).toBeNull();
    expect(readNumberCell("n/a")).toBe("invalid");
  });

  it("reads ISO and day-first dates, workbook dates and Excel serials", () => {
    expect(readDateCell("2026-10-01")).toBe("2026-10-01");
    expect(readDateCell("01/10/2026")).toBe("2026-10-01");
    expect(readDateCell("1-2-2026")).toBe("2026-02-01");
    expect(readDateCell("2026-10-01 08:30")).toBe("2026-10-01");
    expect(readDateCell(new Date(Date.UTC(2026, 9, 1)))).toBe("2026-10-01");
    expect(readDateCell(46296)).toBe("2026-10-01");
    expect(readDateCell("31/02/2026")).toBe("invalid");
    expect(readDateCell("next week")).toBe("invalid");
    expect(readDateCell(null)).toBeNull();
  });

  it("reads a status as its code or its word in either language", () => {
    expect(readStatusCell("Selesai")).toBe("COMPLETED");
    expect(readStatusCell("ongoing")).toBe("ONGOING");
    expect(readStatusCell("In Progress")).toBe("ONGOING");
    expect(readStatusCell("ABANDONED")).toBe("ABANDONED");
    expect(readStatusCell("")).toBeNull();
    expect(readStatusCell("maybe")).toBe("invalid");
  });
});

describe("readDrillHoleSheet", () => {
  it("takes the first non-blank line as the header and ignores what it does not know", () => {
    const read = readDrillHoleSheet(
      sheet([], ["Hole ID", "Geologist", "Dip"], ["DH-1", "Budi", "-60"], [], ["DH-2", "", ""])
    );
    expect(read).toMatchObject({ ok: true, total: 2, invalid: 0, ignoredHeaders: ["Geologist"] });
    if (!read.ok) return;
    expect(read.rows).toEqual([
      { line: 3, data: { holeId: "DH-1", dip: -60 } },
      { line: 5, data: { holeId: "DH-2", dip: null } },
    ]);
  });

  it("leaves a blank status blank, so an update keeps the stored one", () => {
    const read = readDrillHoleSheet(sheet(["Hole ID", "Status"], ["DH-1", ""]));
    expect(read.ok && read.rows[0].data.status).toBeUndefined();
  });

  it("reports every bad row, with its line and column, and keeps the good ones", () => {
    const read = readDrillHoleSheet(
      sheet(
        ["Hole ID", "Azimuth", "Start Date", "End Date", "Status"],
        ["DH-1", "90", "2026-01-01", "2026-02-01", "Planned"],
        ["DH-2", "abc", "", "", ""],
        ["DH-3", "400", "", "", ""],
        ["DH-4", "", "2026-03-01", "2026-02-01", ""],
        ["", "10", "", "", ""],
        ["DH-5", "", "", "", "soon"]
      )
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.rows.map((row) => row.data.holeId)).toEqual(["DH-1"]);
    expect(read.invalid).toBe(5);
    expect(read.errors.map(({ line, field }) => [line, field])).toEqual([
      [3, "azimuth"],
      [4, "azimuth"],
      [5, "endDate"],
      [6, "holeId"],
      [7, "status"],
    ]);
  });

  it("refuses a hole ID the file already used, whatever its case", () => {
    const read = readDrillHoleSheet(sheet(["Hole ID"], ["DH-1"], [" dh-1 "], ["DH-2"]));
    expect(read.ok && read.rows.map((row) => row.data.holeId)).toEqual(["DH-1", "DH-2"]);
    expect(read.ok && read.errors).toEqual([
      { line: 3, holeId: "dh-1", field: "holeId", message: 'Hole ID "dh-1" already appears on line 2.' },
    ]);
  });

  it("says why it cannot read a sheet at all", () => {
    expect(readDrillHoleSheet(sheet([], [""]))).toEqual({ ok: false, error: "empty" });
    expect(readDrillHoleSheet(sheet(["Area", "Dip"], ["A", "1"]))).toEqual({ ok: false, error: "noHoleId" });
    const tooMany = sheet(["Hole ID"], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`H${i}`]));
    expect(readDrillHoleSheet(tooMany)).toEqual({ ok: false, error: "tooMany" });
  });
});

describe("a CSV's separator", () => {
  it("is found on the header line, outside quotes", () => {
    expect(detectCsvDelimiter("Hole ID,Area\nDH-1,A")).toBe(",");
    expect(detectCsvDelimiter("﻿Hole ID;Area;Dip\nDH-1;A;-60,5")).toBe(";");
    expect(detectCsvDelimiter("Hole ID\tArea\nDH-1\tA")).toBe("\t");
    expect(detectCsvDelimiter('"Area, Blok";Hole ID\n')).toBe(";");
  });

  it("reads a semicolon CSV from an Indonesian Excel end to end", () => {
    const text = "Hole ID;Easting;Tanggal Mulai\r\nDH-1;412345,5;01/10/2026\r\n";
    const rows = parseCsv(text, detectCsvDelimiter(text), true);
    const read = readDrillHoleSheet(rows.map((cells, index) => ({ line: index + 1, cells })));
    expect(read.ok && read.rows[0].data).toEqual({ holeId: "DH-1", easting: 412345.5, startDate: "2026-10-01" });
  });
});
