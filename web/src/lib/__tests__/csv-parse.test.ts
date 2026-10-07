import { describe, expect, it } from "vitest";
import { detectDelimiter, normaliseHeader, parseCsv } from "@/lib/csv-parse";

describe("parseCsv", () => {
  it("reads a plain file", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas that sit inside quotes", () => {
    expect(parseCsv('code,note\nX1,"wet, muddy"')).toEqual([
      ["code", "note"],
      ["X1", "wet, muddy"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('note\n"he said ""ok"""')).toEqual([["note"], ['he said "ok"']]);
  });

  it("keeps newlines that sit inside quotes", () => {
    expect(parseCsv('note\n"line one\nline two"')).toEqual([["note"], ["line one\nline two"]]);
  });

  it("handles CRLF line endings from Excel", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips the UTF-8 BOM Excel writes", () => {
    const [header] = parseCsv("﻿Lab Code,Ni (%)\nX1,1.5");
    expect(header[0]).toBe("Lab Code");
  });

  it("drops the blank lines spreadsheets append", () => {
    expect(parseCsv("a,b\n1,2\n\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty cells inside a row that has content", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("returns nothing for an empty or whitespace-only file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  it("handles a file with no trailing newline", () => {
    expect(parseCsv("a\n1")).toEqual([["a"], ["1"]]);
  });
});

// A spreadsheet puts tabs on the clipboard, so the same reader has to do both.
// These repeat the cases above with the separator swapped: quoting is where a
// second parser would have gone wrong, so that is what is checked twice.
describe("parseCsv with tabs", () => {
  it("reads a block copied out of a spreadsheet", () => {
    expect(parseCsv("Ni\tFe\n1.86\t14.24", "\t")).toEqual([
      ["Ni", "Fe"],
      ["1.86", "14.24"],
    ]);
  });

  it("leaves commas alone when the separator is a tab", () => {
    expect(parseCsv("a\tb\n1,5\t2", "\t")).toEqual([
      ["a", "b"],
      ["1,5", "2"],
    ]);
  });

  it("keeps tabs that sit inside quotes", () => {
    expect(parseCsv('code\tnote\nX1\t"wet\tmuddy"', "\t")).toEqual([
      ["code", "note"],
      ["X1", "wet\tmuddy"],
    ]);
  });

  it("still handles CRLF and empty cells", () => {
    expect(parseCsv("a\tb\tc\r\n1\t\t3\r\n", "\t")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });
});

describe("detectDelimiter", () => {
  it("picks the tab a spreadsheet copies with", () => {
    expect(detectDelimiter("Ni\tFe\n1.86\t14.24")).toBe("\t");
  });

  it("picks the comma a saved file uses", () => {
    expect(detectDelimiter("Lab Code,Ni (%)\nX1,1.5")).toBe(",");
  });

  // The case the "first separator wins" rule would have got wrong: a decimal
  // comma leads, but the row is still tab-separated.
  it("is not fooled by a decimal comma ahead of the tab", () => {
    expect(detectDelimiter("1,86\t14,24")).toBe("\t");
  });

  it("ignores a tab that sits inside quotes", () => {
    expect(detectDelimiter('"wet\tmuddy",2')).toBe(",");
  });

  it("only looks at the first record", () => {
    expect(detectDelimiter("a,b\n1\t2")).toBe(",");
  });

  it("falls back to comma for a single column, where the choice cannot matter", () => {
    expect(detectDelimiter("1.86\n2.04")).toBe(",");
  });
});

describe("normaliseHeader", () => {
  it("reduces a printed label to its field key", () => {
    expect(normaliseHeader("Ni (%)")).toBe("ni");
    expect(normaliseHeader("SiO2 (%)")).toBe("sio2");
    expect(normaliseHeader("Al2O3 (%)")).toBe("al2o3");
    expect(normaliseHeader("Fe2O3 (%)")).toBe("fe2o3");
    expect(normaliseHeader("Lab Code")).toBe("labcode");
  });

  it("accepts the bare key just as happily", () => {
    expect(normaliseHeader("ni")).toBe("ni");
    expect(normaliseHeader("  Ni  ")).toBe("ni");
    expect(normaliseHeader("NI")).toBe("ni");
  });

  it("keeps different fields apart", () => {
    expect(normaliseHeader("Ni (%)")).not.toBe(normaliseHeader("Fe (%)"));
    expect(normaliseHeader("MgO (%)")).not.toBe(normaliseHeader("CaO (%)"));
  });
});
