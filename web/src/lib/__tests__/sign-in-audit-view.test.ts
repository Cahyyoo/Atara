import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIGN_IN_OUTCOMES,
  signInAuditWhere,
  listSignInAuditQuerySchema,
} from "@/lib/sign-in-audit-query";
import { getShiftDayBounds, parseShiftDateInput } from "@/lib/shift-date";

/**
 * Reading the sign-in trail.
 *
 * `sign-in-audit.test.ts` holds the writer to its promises. This holds the
 * reader to its own, and the failure here is the same shape: nothing crashes
 * when a screen shows the trail wrongly. A row whose "verified" column was
 * guessed from the outcome beside it looks exactly as authoritative as one that
 * read the stored fact -- and it is the one fact this table exists to carry.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

const TABLE = read("components", "activity", "sign-in-audit-table.tsx");
const TABS = read("components", "activity", "activity-tabs.tsx");
const PAGE = read("app", "(app)", "activity", "page.tsx");
const ROUTE = read("app", "api", "sign-in-audit", "route.ts");
const EXPORT = read("app", "api", "sign-in-audit", "export", "route.ts");
const SCHEMA = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

/** Source without comments: the ones here explain what was avoided and why. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

describe("the outcome list", () => {
  /**
   * Every outcome in the schema is offered. The list is checked against the
   * enum at compile time, but only for extras -- a value added to the schema
   * and never listed here would still type-check, and the rows carrying it
   * would look like a hole in the trail rather than a hole in this array.
   */
  it("covers every outcome the schema declares", () => {
    const enumBody = SCHEMA.slice(
      SCHEMA.indexOf("enum SignInOutcome {"),
      SCHEMA.indexOf("}", SCHEMA.indexOf("enum SignInOutcome {"))
    );
    const declared = enumBody
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Z_]+$/.test(line));

    expect(declared.length).toBeGreaterThan(0);
    expect([...SIGN_IN_OUTCOMES].sort()).toEqual([...declared].sort());
  });

  /**
   * The two that carry the distinction sit at the top, not wherever the
   * alphabet put them: "password only" against "a face was checked" is the
   * comparison the whole table is for, and a reader should meet it first.
   */
  it("leads with the verified outcomes, not with the alphabet", () => {
    expect(SIGN_IN_OUTCOMES[0]).toBe("FACE_VERIFIED");
    expect(SIGN_IN_OUTCOMES.indexOf("PASSWORD_ONLY")).toBeLessThan(
      SIGN_IN_OUTCOMES.indexOf("PASSWORD_FAILED")
    );
  });

  it("refuses an outcome it does not know", () => {
    expect(listSignInAuditQuerySchema.safeParse({ outcome: "TOTALLY_MADE_UP" }).success).toBe(
      false
    );
  });
});

describe("the date range", () => {
  /**
   * A lab day, not a calendar day. The shift turns over at 07:00 WITA, so a
   * sign-in at 06:30 belongs to the day before -- and an auditor asking about
   * "the 22nd" means the shift the lab calls the 22nd.
   */
  it("uses the lab's own boundary, not midnight", () => {
    const where = signInAuditWhere({ from: "2026-09-22", to: "2026-09-22" });
    const day = getShiftDayBounds(parseShiftDateInput("2026-09-22")!);

    expect(where.createdAt).toEqual({ gte: day.from, lt: day.to });
  });

  /**
   * Inclusive at the far end. A range whose last day quietly fell outside it
   * would be read wrong by everyone who used it, and the rows it dropped are
   * the most recent ones -- exactly the ones somebody investigating wants.
   */
  it("includes the whole of its last day", () => {
    const where = signInAuditWhere({ from: "2026-09-20", to: "2026-09-22" });
    const last = getShiftDayBounds(parseShiftDateInput("2026-09-22")!);

    expect((where.createdAt as { lt: Date }).lt).toEqual(last.to);
  });

  it("leaves the window open at either end when only one day is given", () => {
    const from = signInAuditWhere({ from: "2026-09-20" }).createdAt as Record<string, unknown>;
    expect(from.gte).toBeInstanceOf(Date);
    expect(from.lt).toBeUndefined();

    const to = signInAuditWhere({ to: "2026-09-20" }).createdAt as Record<string, unknown>;
    expect(to.lt).toBeInstanceOf(Date);
    expect(to.gte).toBeUndefined();
  });

  it("ignores a date that is not one", () => {
    expect(signInAuditWhere({ from: "not-a-date" }).createdAt).toBeUndefined();
  });
});

describe("the filters", () => {
  it("narrow by person and by outcome", () => {
    const where = signInAuditWhere({ userId: "u1", outcome: "PASSWORD_ONLY" });
    expect(where.userId).toBe("u1");
    expect(where.outcome).toBe("PASSWORD_ONLY");
  });

  it("match everything when nothing is asked", () => {
    expect(signInAuditWhere({})).toEqual({});
  });
});

describe("the summary", () => {
  /**
   * It ignores the outcome filter and only that one. Picking "password only"
   * should narrow the rows while the chips still show every kind -- otherwise
   * choosing one collapses the summary to a single figure and takes away the
   * comparison that made you click it.
   */
  it("drops the outcome filter and keeps the rest", () => {
    expect(code(ROUTE)).toContain("signInAuditWhere({ ...query, outcome: undefined })");
  });

  it("is counted in the database, so paging cannot change it", () => {
    expect(code(ROUTE)).toContain("prisma.signInAudit.groupBy");
    expect(code(ROUTE)).toContain('by: ["outcome"]');
  });
});

describe("what was verified", () => {
  /**
   * The reason the table exists, and it is read from the stored booleans.
   *
   * `faceVerified` and `totpVerified` are written deliberately by the sign-in
   * routes precisely so nothing downstream has to work them out. If the UI
   * inferred them from the outcome instead, an outcome added later would
   * inherit an answer nobody chose -- and the trail would be confidently
   * wrong, which is worse than empty.
   */
  it("is read from the row, never worked out from the outcome", () => {
    expect(code(TABLE)).toContain("entry.faceVerified");
    expect(code(TABLE)).toContain("entry.totpVerified");

    // No branch anywhere that decides "verified" by looking at the outcome.
    expect(code(TABLE)).not.toMatch(/outcome\s*===\s*"(FACE|TOTP)_VERIFIED"/);
    // The route hands the column straight on; anything else in that slot is a
    // derivation, which is the thing being ruled out.
    expect(code(ROUTE)).not.toMatch(/faceVerified:(?!\s*entry\.faceVerified)/);
  });

  it("comes back from the route as its own two fields", () => {
    expect(code(ROUTE)).toContain("faceVerified: entry.faceVerified");
    expect(code(ROUTE)).toContain("totpVerified: entry.totpVerified");
  });

  /**
   * A signed-in-on-a-password-alone row must not look like a success. It is
   * not a failure either -- somebody did get in -- so it is neutral, and
   * never the same colour as a verified one.
   */
  it("does not dress a password-only sign-in as a verified one", () => {
    const tone = code(TABLE).slice(code(TABLE).indexOf("OUTCOME_TONE"));
    expect(tone).toMatch(/PASSWORD_ONLY:\s*"secondary"/);
    expect(tone).toMatch(/FACE_VERIFIED:\s*"default"/);
  });
});

describe("the address", () => {
  /**
   * Null whenever TRUST_PROXY is unset, because x-forwarded-for is the
   * caller's own to write. A column that quietly showed whatever was claimed
   * would put an attacker's chosen address into an audit trail.
   */
  it("shows a blank rather than a guess", () => {
    expect(code(TABLE)).toContain("entry.address ??");
    expect(code(TABLE)).not.toContain("x-forwarded-for");
  });
});

describe("the export", () => {
  /**
   * Same filters, same builder. A download that quietly covers a different
   * set than the rows it was started from still produces a perfectly valid
   * file, which is why this is asserted rather than trusted.
   */
  it("is built from the same where as the table", () => {
    expect(code(EXPORT)).toContain("signInAuditWhere(filters)");
    for (const key of ["userId", "outcome", "from", "to"]) {
      expect(code(EXPORT)).toContain(`searchParams.get("${key}")`);
    }
  });

  it("counts before it writes a byte, so the cap can still be a 413", () => {
    const source = code(EXPORT);
    expect(source.indexOf("EXPORT_ROW_LIMIT")).toBeLessThan(source.indexOf("exportResponse("));
  });

  it("pages with a tie-break, so no row is skipped or repeated", () => {
    expect(code(EXPORT)).toContain('orderBy: [{ createdAt: "desc" }, { id: "desc" }]');
  });

  it("carries the verified columns, which is what an auditor filters on", () => {
    expect(code(EXPORT)).toContain('key: "faceVerified"');
    expect(code(EXPORT)).toContain('key: "totpVerified"');
  });

  it("writes timestamps on the lab's clock", () => {
    expect(code(EXPORT)).toContain("formatWitaDateTime(entry.createdAt)");
  });
});

describe("who may read it", () => {
  /**
   * Data about people. An operator seeing when everyone else signed in is not
   * it. viewActivity is the admin's alone (see permissions.test.ts).
   */
  it("needs viewActivity, at the route and at the page", () => {
    expect(code(ROUTE)).toContain('await requireCapability(request, "viewActivity")');
    expect(code(EXPORT)).toContain('await requireCapability(request, "viewActivity")');
    expect(code(PAGE)).toContain('await requireCapabilityPage("viewActivity")');
  });
});

describe("the two trails share one page", () => {
  /**
   * An eleventh sidebar entry for a page only admins open, and rarely, would
   * be noise in a menu every operator sees all day.
   */
  it("are tabs, not a new menu entry", () => {
    const sidebar = read("components", "layout", "sidebar-nav.tsx");
    expect(sidebar).not.toContain("sign-in-audit");
    expect(sidebar).not.toContain("signInAudit");
    expect(code(TABS)).toContain("StageActivityTable");
    expect(code(TABS)).toContain("SignInAuditTable");
  });

  /**
   * Switching tabs clears the filters belonging to the one being left. The two
   * share the URL, so an `outcome` left behind would narrow nothing visible and
   * then reappear in an export the moment somebody came back.
   */
  it("do not leave each other's filters in the URL", () => {
    const source = code(TABS);
    for (const key of ["operatorId", "stageId", "shiftDate", "corrections", "userId", "outcome"]) {
      expect(source).toContain(`"${key}"`);
    }
    expect(source).toContain("TAB_PARAMS[tab]");
  });

  /**
   * The hidden tab is unmounted, not hidden with a class. Each table refetches
   * on every filter change, and one kept mounted offscreen would go on asking
   * for rows nobody is reading.
   */
  it("only mount the tab being looked at", () => {
    expect(code(TABS)).toMatch(/tab === "stages" \? <StageActivityTable/);
    expect(code(TABS)).not.toContain("hidden");
  });
});
