import { describe, expect, it } from "vitest";
import { mapPastedRows, type PasteTarget } from "@/modules/lab/lib/records/paste-map";
import { parseSheetDateTime, readMeasurementFinished } from "@/modules/lab/lib/records/measurement-time";

function target(overrides: Partial<PasteTarget> & { id: string }): PasteTarget {
  return {
    labCode: `SPR.QLAB.20260917.00${overrides.id}`,
    sampleIdent: null,
    values: {},
    ...overrides,
  };
}

const HEADER = ["Sample ID", "Ni", "Fe", "Co", "SiO2", "MgO"];

describe("mapPastedRows", () => {
  it("reads a block with a header and pairs rows by Sample ID", () => {
    const targets = [
      target({ id: "1", sampleIdent: "MOL/LIM/S3/PA4/B42/919.3/12", values: { ni: 1.2 } }),
      target({ id: "2", sampleIdent: "MOL/LIM/S3/PA4/B42/919.4/12" }),
    ];

    const result = mapPastedRows(
      [
        HEADER,
        // Deliberately the second selected row first: an id match must not
        // depend on the order the preparator ticked the boxes in.
        ["MOL/LIM/S3/PA4/B42/919.4/12", "1.90", "14.20", "0.03", "40.1", "12.0"],
        ["MOL/LIM/S3/PA4/B42/919.3/12", "1.86", "14.24", "0.02", "39.8", "11.5"],
      ],
      targets
    );

    expect(result.matchedBy).toBe("ident");
    expect(result.hasHeader).toBe(true);
    expect(result.summary).toMatchObject({ total: 2, update: 2, unknown: 0, invalid: 0 });
    expect(result.rows[0].targetId).toBe("2");
    expect(result.rows[1].targetId).toBe("1");
    expect(result.rows[1].values).toEqual({ ni: 1.86, fe: 14.24, co: 0.02, sio2: 39.8, mgo: 11.5 });
    expect(result.rows[1].changes.ni).toEqual({ from: 1.2, to: 1.86 });
    expect(result.blocker).toBeNull();
  });

  // Ids are composed without the old letters now; the lab's sheets still write them.
  it("finds a record composed without the S, P and B letters from a sheet that writes them", () => {
    const targets = [
      target({ id: "1", sampleIdent: "LAM AA 1/A199/2/1.1/1", sackCount: 1 }),
      target({ id: "2", sampleIdent: "MOL SAP S3/PA4/B42/919.3/12", sackCount: 12 }),
    ];

    const result = mapPastedRows(
      [HEADER, ["LAM AA S1/PA199/B2/1.1", "1.86"], ["MOL SAP S3/PA4/B42/919.3", "1.90"]],
      targets
    );

    expect(result.rows.map((row) => row.targetId)).toEqual(["1", "2"]);
    expect(result.summary).toMatchObject({ update: 2, unknown: 0, invalid: 0 });
  });

  it("pairs by position when the block carries no identifying column", () => {
    const result = mapPastedRows(
      [
        ["1.86", "14.24"],
        ["1.90", "14.20"],
      ],
      [target({ id: "1" }), target({ id: "2" })]
    );

    expect(result.matchedBy).toBe("order");
    expect(result.hasHeader).toBe(false);
    // A block that opens with a number is the assay columns on their own,
    // which still reads from Ni. The comment here used to call that "the
    // instrument's own column order"; it is not, and believing so is what
    // refused every block copied straight out of the sheet.
    expect(result.rows[0].values).toEqual({ ni: 1.86, fe: 14.24 });
    expect(result.rows[0].targetId).toBe("1");
    expect(result.rows[1].targetId).toBe("2");
  });

  it("refuses a positional block whose row count does not match the selection", () => {
    const result = mapPastedRows(
      [["1.86"], ["1.90"], ["2.01"]],
      [target({ id: "1" }), target({ id: "2" })]
    );

    expect(result.blocker).toEqual({ kind: "count", pasted: 3, selected: 2 });
  });

  it("does not block on count when rows are matched by id", () => {
    const targets = [
      target({ id: "1", sampleIdent: "A/1" }),
      target({ id: "2", sampleIdent: "A/2" }),
      target({ id: "3", sampleIdent: "A/3" }),
    ];

    const result = mapPastedRows([["Sample ID", "Ni"], ["A/2", "1.9"]], targets);

    expect(result.blocker).toBeNull();
    expect(result.rows[0].targetId).toBe("2");
  });

  it("flags a pasted row whose id is not among the selected rows", () => {
    const result = mapPastedRows(
      [["Sample ID", "Ni"], ["A/9", "1.9"]],
      [target({ id: "1", sampleIdent: "A/1" })]
    );

    expect(result.rows[0].status).toBe("unknown");
    expect(result.rows[0].targetId).toBeNull();
    expect(result.summary.unknown).toBe(1);
  });

  it("refuses the same record twice in one block", () => {
    const targets = [target({ id: "1", sampleIdent: "A/1" })];
    const result = mapPastedRows(
      [["Sample ID", "Ni"], ["A/1", "1.9"], ["A/1", "2.1"]],
      targets
    );

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].message).toBe("duplicate");
  });

  it("reads a column headed Lab Code as the Sample ID, and never matches on Lab Codes", () => {
    const targets = [target({ id: "1", sampleIdent: "LAM/SAM/S2/PA4/B10/3778.1/25", sackCount: 25 })];
    const asIdent = mapPastedRows([["Lab Code", "Ni"], ["LAM/SAM/S2/PA4/B10/3778.1", "1.9"]], targets);
    expect(asIdent).toMatchObject({ matchedBy: "ident", keyHeader: "labCode" });
    expect(asIdent.rows[0].targetId).toBe("1");

    const asLabCode = mapPastedRows([["Lab Code", "Ni"], ["SPR.QLAB.20260917.001", "1.9"]], targets);
    expect(asLabCode.rows[0].status).toBe("unknown");
  });

  it("prefers a column headed Sample ID when a Lab Code column is there too, as on an export", () => {
    const result = mapPastedRows(
      [["Lab Code", "Sample ID", "Ni"], ["SPR.QLAB.20260917.001", "A/1", "1.9"]],
      [target({ id: "1", sampleIdent: "A/1" })]
    );
    expect(result).toMatchObject({ matchedBy: "ident", keyHeader: "sampleIdent" });
    expect(result.rows[0].targetId).toBe("1");
  });

  it("leaves a stored value alone where the pasted cell is empty", () => {
    const result = mapPastedRows(
      [["Sample ID", "Ni", "Fe"], ["A/1", "", "14.24"]],
      [target({ id: "1", sampleIdent: "A/1", values: { ni: 1.86 } })]
    );

    expect(result.rows[0].values).toEqual({ fe: 14.24 });
    expect(result.rows[0].changes).not.toHaveProperty("ni");
  });

  it("reports a row as unchanged when every cell already matches", () => {
    const result = mapPastedRows(
      [["Sample ID", "Ni"], ["A/1", "1.86"]],
      [target({ id: "1", sampleIdent: "A/1", values: { ni: 1.86 } })]
    );

    expect(result.rows[0].status).toBe("unchanged");
    expect(result.rows[0].values).toEqual({});
  });

  it("reads the decimal comma and thousands separators a sheet writes", () => {
    const result = mapPastedRows(
      [["Sample ID", "Ni", "Sum"], ["A/1", "1,86", "1 000.5"]],
      [target({ id: "1", sampleIdent: "A/1" })]
    );

    expect(result.rows[0].values).toEqual({ ni: 1.86, sum: 1000.5 });
  });

  it("marks a row invalid rather than writing a number it could not read", () => {
    const result = mapPastedRows(
      [["Sample ID", "Ni"], ["A/1", "n/a"]],
      [target({ id: "1", sampleIdent: "A/1" })]
    );

    expect(result.rows[0].status).toBe("invalid");
    expect(result.rows[0].values).toEqual({});
    expect(result.rows[0].message).toContain("ni");
  });

  it("carries the text columns the instrument reports", () => {
    const result = mapPastedRows(
      [
        ["Sample ID", "Measurement Method", "Solution ID"],
        ["A/1", "STARGATE_LG-GEO", "878"],
      ],
      [target({ id: "1", sampleIdent: "A/1" })]
    );

    expect(result.rows[0].values).toEqual({
      measurementMethod: "STARGATE_LG-GEO",
      solutionId: "878",
    });
  });

  // Reachable only through a header: without one the columns are taken
  // positionally, and position always names a field.
  it("refuses a header that names only identifying columns", () => {
    const result = mapPastedRows(
      [["Sample ID", "Lab Code"], ["A/1", "SPR.QLAB.20260917.001"]],
      [target({ id: "1", sampleIdent: "A/1" })]
    );

    expect(result.blocker).toEqual({ kind: "noColumns" });
    expect(result.rows).toEqual([]);
  });
});

/**
 * The instrument's own export, as it arrives on the clipboard: twenty-one
 * columns, no Sample ID and no Lab Code, so the rows pair by position.
 */
describe("a block straight off the instrument", () => {
  const NOW = new Date("2026-09-21T00:00:00.000Z");

  const HEADER = [
    "Measurement Finished", "Ni (%)", "Fe (%)", "Co (%)", "SiO2 (%)", "MgO (%)",
    "CaO (%)", "Al2O3 (%)", "Cr (%)", "Fe2O3 (%)", "Cr2O3 (%)", "MnO (%)",
    "Na2O (%)", "P2O5 (%)", "TiO2 (%)", "S (%)", "CO2 (%)", "Zn (%)", "Sum (%)",
    "Measurement Method", "Solution ID",
  ];
  const ROW = [
    "3/11/2026 13:10", "1.12", "42.29", "0.137", "10.15", "2.46", "0.042",
    "7.19", "1.33", "60.43", "2.83", "0.26", "0.036", "0.001", "0.2", "0.008",
    "14.52", "0.033", "100", "STARGATE_LG-GEO", "866",
  ];

  it("reads every one of its columns", () => {
    const result = mapPastedRows([HEADER, ROW], [target({ id: "1" })], NOW);

    expect(result.blocker).toBeNull();
    expect(result.rows[0].status).toBe("update");
    // Every parenthesised unit is stripped from the heading, so all eighteen
    // assay columns land plus the three the instrument reports itself.
    expect(Object.keys(result.rows[0].values)).toHaveLength(21);
    expect(result.rows[0].values.ni).toBe(1.12);
    expect(result.rows[0].values.sum).toBe(100);
    expect(result.rows[0].values.measurementMethod).toBe("STARGATE_LG-GEO");
    expect(result.rows[0].values.solutionId).toBe("866");
  });

  it("reads its date as 11 March, not 3 November", () => {
    const result = mapPastedRows([HEADER, ROW], [target({ id: "1" })], NOW);
    expect(result.rows[0].values.measurementFinished).toBe("2026-03-11T05:10:00.000Z");
  });

  it("pairs by position, since the sheet names no sample", () => {
    const result = mapPastedRows(
      [HEADER, ROW, ROW.map((cell, i) => (i === 0 ? "3/11/2026 13:15" : cell))],
      [target({ id: "1" }), target({ id: "2" })],
      NOW
    );

    expect(result.matchedBy).toBe("order");
    expect(result.rows.map((row) => row.targetId)).toEqual(["1", "2"]);
  });

  it("refuses the block when a date reads as the future, and writes nothing", () => {
    // The same cell the other way round: 11/3 month-first is 3 November.
    const future = [...ROW];
    future[0] = "11/3/2026 13:10";
    const result = mapPastedRows([HEADER, future], [target({ id: "1" })], NOW);

    expect(result.rows[0].status).toBe("invalid");
    expect(result.rows[0].message).toBe("futureDate");
    expect(result.rows[0].values).toEqual({});
  });
});

/**
 * Asserted as instants, never as `getDate()`/`getHours()`: those read the
 * machine's own timezone, so on this WITA laptop they would agree with the
 * expected numbers no matter which clock the parser actually used, and quietly
 * disagree on a build machine set to UTC. Every cell is a WITA wall clock, so
 * 14:03 is 06:03Z.
 */
describe("parseSheetDateTime", () => {
  it("reads the unambiguous ISO-ish form as written, on the lab's clock", () => {
    expect(parseSheetDateTime("2026-09-17 14:03")?.toISOString()).toBe("2026-09-17T06:03:00.000Z");
  });

  /**
   * The instrument writes the month first, so "3/11/2026" off its export is
   * 11 March. Day-first also parses that text — day 3, month 11 — which is
   * exactly why the order has to be decided rather than left to whichever
   * reading happens to succeed: it used to be the other way round and stored
   * every such row eight months out, silently.
   */
  it("reads a slashed date month-first, the way the instrument writes it", () => {
    expect(parseSheetDateTime("3/11/2026 13:10")?.toISOString()).toBe("2026-03-11T05:10:00.000Z");
    expect(parseSheetDateTime("05/06/2026 08:30")?.toISOString()).toBe("2026-05-06T00:30:00.000Z");
  });

  it("falls back to day-first only where month-first cannot be a date", () => {
    // There is no month 13, so this one can only be the 13th of May.
    expect(parseSheetDateTime("13/05/2026 14:03")?.toISOString()).toBe("2026-05-13T06:03:00.000Z");
  });

  it("rejects a day the month does not have instead of rolling it forward", () => {
    // Impossible read either way round: there is no month 31, and April has
    // no 31st. Neither attempt may quietly become 1 May.
    expect(parseSheetDateTime("31/04/2026")).toBeNull();
  });

  it("rejects an impossible time", () => {
    expect(parseSheetDateTime("2026-09-17 25:00")).toBeNull();
  });

  // The same text with a Z is an absolute instant, eight hours from the wall
  // clock reading. Refusing it is what keeps the two from being confused.
  it("refuses a form that means something other than a wall clock", () => {
    expect(parseSheetDateTime("2026-09-17T06:03:00.000Z")).toBeNull();
  });

  it("returns null for anything it cannot read without guessing", () => {
    expect(parseSheetDateTime("")).toBeNull();
    expect(parseSheetDateTime("17 Sep 2026")).toBeNull();
    expect(parseSheetDateTime("yesterday")).toBeNull();
  });
});

/**
 * What catches the next wrong guess. Reversing the month-first order fixes
 * today's sheet; a date in the future is what reading one the wrong way round
 * looks like from either direction, so this is the part that generalises.
 */
describe("readMeasurementFinished", () => {
  const now = new Date("2026-09-21T00:00:00.000Z");

  it("accepts a measurement already made", () => {
    const read = readMeasurementFinished("3/11/2026 13:10", now);
    expect(read.ok).toBe(true);
    expect(read.ok && read.value.toISOString()).toBe("2026-03-11T05:10:00.000Z");
  });

  it("refuses one the instrument cannot have finished yet", () => {
    // What the old day-first reading made of the very same cell.
    const read = readMeasurementFinished("11/3/2026 13:10", now);
    expect(read).toEqual({ ok: false, reason: "future" });
  });

  it("allows a day of grace, so a fast instrument clock is not an error", () => {
    expect(readMeasurementFinished("2026-09-21 18:00", now).ok).toBe(true);
    expect(readMeasurementFinished("2026-09-22 06:00", now).ok).toBe(true);
    expect(readMeasurementFinished("2026-09-23 06:00", now)).toEqual({
      ok: false,
      reason: "future",
    });
  });

  it("tells an unreadable cell apart from a future one", () => {
    // Two different things to fix, so they are not reported as one.
    expect(readMeasurementFinished("yesterday", now)).toEqual({ ok: false, reason: "unreadable" });
  });
});

/**
 * The same instrument export as above, minus the header row.
 *
 * Selecting the data rows and leaving the headings behind is the ordinary
 * way to copy out of a sheet, and it was the one that did not work: with no
 * headings to read, the cells were taken by position starting at Ni, so the
 * timestamp landed in the Ni column and every row came back as an unreadable
 * number.
 */
describe("the same block, pasted without its header row", () => {
  const ROWS = [
    ["3/16/2026 10:34", "2.03", "24.18", "0.077", "25.66", "10.86", "0.536", "6.44", "1.3",
     "34.56", "1.89", "0.51", "0.047", "0.002", "0.074", "0.008", "17.26", "0.0368", "100",
     "STARGATE_LG-GEO", "883"],
    ["3/16/2026 10:42", "1.02", "43.67", "0.193", "2.18", "1.47", "0.031", "10.79", "1.85",
     "62.4", "2.7", "1.13", "0.04", "0.002", "0.033", "0.017", "17.58", "0.0381", "100",
     "STARGATE_LG-GEO", "883"],
    ["3/16/2026 10:50", "0.38", "42.73", "0.187", "2.39", "1.53", "0.017", "11.17", "1.9",
     "61.06", "2.78", "1.26", "0.034", "0.002", "0.033", "0.069", "17.55", "0.0368", "100",
     "STARGATE_LG-GEO", "883"],
  ];

  // After the measurements, so the future-date guard has nothing to say.
  const NOW = new Date("2026-09-25T00:00:00Z");

  const three = () => [target({ id: "1" }), target({ id: "2" }), target({ id: "3" })];

  it("is taken without its header row", () => {
    const result = mapPastedRows(ROWS, three(), NOW);

    expect(result.hasHeader).toBe(false);
    expect(result.summary).toMatchObject({ total: 3, update: 3, invalid: 0, unknown: 0 });
  });

  it("puts every cell in the column it came from", () => {
    const [first] = mapPastedRows(ROWS, three(), NOW).rows;

    expect(first.values).toMatchObject({
      ni: 2.03,
      fe: 24.18,
      co: 0.077,
      sio2: 25.66,
      zn: 0.0368,
      sum: 100,
      measurementMethod: "STARGATE_LG-GEO",
      solutionId: "883",
    });
  });

  it("reads the timestamp as the lab's own clock", () => {
    // 10:34 in WITA, which is 02:34 UTC. Read as an absolute instant instead,
    // every measurement would land eight hours out.
    const [first] = mapPastedRows(ROWS, three(), NOW).rows;

    expect(first.values.measurementFinished).toBe("2026-03-16T02:34:00.000Z");
  });

  it("reads as far as the selection goes and no further", () => {
    // Somebody who selects the timestamp through to Sum, leaving the two text
    // columns out, gets those nineteen and nothing invented past them.
    const shortened = ROWS.map((row) => row.slice(0, 19));
    const [first] = mapPastedRows(shortened, three(), NOW).rows;

    expect(first.status).toBe("update");
    expect(first.values.sum).toBe(100);
    expect(first.values).not.toHaveProperty("measurementMethod");
  });

  it("still leaves an assay-only block reading from Ni", () => {
    /**
     * The layout is chosen by reading the block, and this is the half that
     * must not move. A date and a number can never be mistaken for each
     * other -- "2.03" has one separator where a date needs two -- so adding
     * the instrument layout takes nothing away from the one already there.
     */
    const result = mapPastedRows(
      [["1.86", "14.24"], ["1.90", "14.20"], ["2.01", "14.11"]],
      three(),
      NOW
    );

    expect(result.rows[0].values).toEqual({ ni: 1.86, fe: 14.24 });
  });
});
