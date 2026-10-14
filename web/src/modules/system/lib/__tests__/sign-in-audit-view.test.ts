import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guard } from "@/core/testing/guards";
import { systemModule } from "@/modules/system/module";
import {
  SIGN_IN_OUTCOMES,
  signInAuditWhere,
  listSignInAuditQuerySchema,
} from "@/modules/system/lib/sign-in-audit-query";
import { workdayBounds, parseDayInput } from "@/core/lib/wita-time";

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

const TABLE = read("modules", "system", "components", "activity", "sign-in-audit-table.tsx");
const TABLE_TYPES = read("modules", "system", "components", "activity", "sign-in-audit-types.ts");
const PAGE = read("app", "(app)", "admin", "sign-ins", "page.tsx");
const ROUTE = read("app", "api", "(system)", "sign-in-audit", "route.ts");
const EXPORT = read("app", "api", "(system)", "sign-in-audit", "export", "route.ts");
const SCHEMA = readFileSync(join(process.cwd(), "prisma", "schema", "core.prisma"), "utf8");

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
    const day = workdayBounds(parseDayInput("2026-09-22")!);

    expect(where.createdAt).toEqual({ gte: day.from, lt: day.to });
  });

  /**
   * Inclusive at the far end. A range whose last day quietly fell outside it
   * would be read wrong by everyone who used it, and the rows it dropped are
   * the most recent ones -- exactly the ones somebody investigating wants.
   */
  it("includes the whole of its last day", () => {
    const where = signInAuditWhere({ from: "2026-09-20", to: "2026-09-22" });
    const last = workdayBounds(parseDayInput("2026-09-22")!);

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
    // The colours live beside the table's types (sign-in-audit-types.ts).
    const tone = code(TABLE_TYPES).slice(code(TABLE_TYPES).indexOf("OUTCOME_TONE"));
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
   * Data about people, across every department since the app became a super
   * app. viewSignInAudit is the super admin's alone (see permissions.test.ts).
   */
  it("needs viewSignInAudit, at the route and at the page", () => {
    expect(code(ROUTE)).toMatch(guard("viewSignInAudit"));
    expect(code(EXPORT)).toMatch(guard("viewSignInAudit"));
    expect(code(PAGE)).toContain('await requireCapabilityPage("viewSignInAudit")');
  });
});

describe("each trail on its own page", () => {
  /**
   * The stage trail is the lab admin's (/lab/activity), the sign-in trail the
   * super admin's (/admin/sign-ins). They used to be tabs of one component,
   * which tied the lab module to the system module; now each page renders its
   * own table, and the super admin's menu -- which no preparator sees -- links
   * the sign-in one.
   */
  it("renders one table each, from its own module", () => {
    expect(systemModule.nav.map((item) => item.href)).toContain("/admin/sign-ins");
    const labPage = code(read("app", "(app)", "lab", "activity", "page.tsx"));
    expect(code(PAGE)).toContain("<SignInAuditTable />");
    expect(code(PAGE)).not.toContain("StageActivityTable");
    expect(labPage).toContain("<StageActivityTable");
    expect(labPage).not.toContain("SignInAuditTable");
  });
});

