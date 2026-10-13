import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fieldForHeader } from "@/modules/lab/lib/records/paste-columns";
import { IMPORT_EXAMPLE_COLUMNS, readImportSheet } from "@/modules/lab/lib/records/lab-record-import";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";

/**
 * What the import screen says it takes, against what it takes.
 *
 * The two had drifted, in the direction that costs work: the dialog showed a
 * heading row of five elements while the importer had always mapped headings
 * through the same fieldForHeader the paste dialog uses -- every element, plus
 * the instrument's own three columns. Anybody reading the example would have
 * cut columns out of a sheet that needed no cutting.
 *
 * Nothing catches that. Both sides work; they simply describe different
 * formats, and only the smaller one is written down.
 */

const DIALOG = readFileSync(
  join(process.cwd(), "src", "modules", "lab", "components", "assay", "paste-import.tsx"),
  "utf8"
);

/**
 * The example the dialog offers.
 *
 * Read as the value, not scraped out of the component. A first version matched
 * quoted strings in the source and silently missed all eighteen element names,
 * because those come from a map() rather than from literals -- so it reported
 * the example as incomplete when it was not.
 */
const exampleColumns = () => [...IMPORT_EXAMPLE_COLUMNS];

describe("the example heading row", () => {
  it("names a key column, without which nothing can be matched", () => {
    // The import screen ticks nothing, so this column is the only thing that
    // says which sample a row belongs to.
    const columns = exampleColumns();
    expect(columns.some((column) => /lab code|sample id/i.test(column))).toBe(true);
  });

  it("offers every element, not the five the database table shows", () => {
    const columns = exampleColumns().map((column) => column.toLowerCase());

    for (const field of ASSAY_FIELDS) {
      expect(
        columns.some((column) => column.startsWith(field.csvLabel.toLowerCase().slice(0, 4))),
        `${field.csvLabel} is accepted but the example does not mention it`
      ).toBe(true);
    }
  });

  it("offers the instrument's own columns too", () => {
    const joined = exampleColumns().join(" ").toLowerCase();
    for (const column of ["measurement finished", "measurement method", "solution id"]) {
      expect(joined).toContain(column);
    }
  });

  it("names nothing the importer would ignore", () => {
    /**
     * The other direction, and the worse one: an example column that maps to
     * nothing would be filled in carefully and then silently dropped.
     */
    for (const column of exampleColumns()) {
      expect(fieldForHeader(column), `the example offers "${column}", which maps to nothing`).not.toBeNull();
    }
  });

  it("is a sheet the importer actually accepts", () => {
    // The example and one row of zeros, read the way a paste would be.
    const header = exampleColumns().join("\t");
    const row = exampleColumns()
      .map((column) => (/lab code|sample id/i.test(column) ? "SPR.QLAB.20260921.001" : "0"))
      .join("\t");

    const sheet = readImportSheet(`${header}\n${row}`);
    expect(sheet.ok).toBe(true);
  });
});

describe("the blank template", () => {
  const ROUTE = readFileSync(
    join(process.cwd(), "src", "app", "api", "(lab)", "lab-records", "template", "route.ts"),
    "utf8"
  );

  it("comes in two shapes, because the two screens ask different things", () => {
    /**
     * "instrument" has no key column and belongs to the paste screen, where
     * rows are matched to the ticked samples in order. "keyed" carries the
     * Sample ID for the import screen, which ticks nothing and so has no other
     * way to tell which sample a row is for.
     */
    expect(ROUTE).toContain("instrument:");
    expect(ROUTE).toContain("keyed:");
    expect(ROUTE).toContain('{ header: "Sample ID"');
  });

  it("ships no example rows", () => {
    // A template with a made-up lab code in it gets filled in around the
    // example and imported with it still there -- a row that matches nothing,
    // or worse, one that matches something.
    expect(ROUTE).toContain("AsyncIterable<SheetRow> {}");
  });

  it("is offered on both screens that match by Sample ID, in the keyed shape", () => {
    expect(DIALOG).toContain('/api/lab-records/template?shape=keyed');

    // The paste sheet matches rows by Sample ID too, so it offers the same shape.
    const sheet = readFileSync(
      join(process.cwd(), "src", "modules", "lab", "components", "assay", "paste-sheet", "paste-sheet-dialog.tsx"),
      "utf8"
    );
    expect(sheet).toContain('/api/lab-records/template?shape=keyed');
  });
});
