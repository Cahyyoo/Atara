import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guard } from "@/core/testing/guards";
import { MODULES } from "@/modules/registry";
import ExcelJS from "exceljs";
import type { Department, Role } from "@/core/lib/auth/permissions";
import { en } from "@/core/i18n/test-messages";
import { id } from "@/core/i18n/test-messages";
import { prisma } from "@/core/lib/prisma";
import { announcementSchema } from "@/modules/system/validation";
import { isShownTo, loadActiveAnnouncements, invalidateAnnouncements } from "@/modules/system/lib/announcements";
import { HELP_SECTIONS, helpSectionForPath, helpSectionsFor } from "@/core/lib/app/help-sections";
import { workbookStreamResponse } from "@/core/lib/sheets/export-response";
import { backupCounts, backupSheets } from "@/modules/backup";
import type { AnnouncementDTO } from "@/modules/system/types";

/**
 * Announcements, the in-app guide and the backup: the rules without a
 * database first, then against it (skipped when there is none).
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

const announcement = (over: Partial<AnnouncementDTO>): AnnouncementDTO => ({
  id: "a",
  message: "x",
  tone: "INFO",
  roles: null,
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: null,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("who sees an announcement, and when", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("shows a live one to everybody when no role is named", () => {
    expect(isShownTo(announcement({}), "PREPARATOR", now)).toBe(true);
  });

  it("hides one that has not started or has ended", () => {
    expect(isShownTo(announcement({ startsAt: "2026-07-01T00:00:00.000Z" }), "ADMIN", now)).toBe(false);
    expect(isShownTo(announcement({ endsAt: "2026-05-01T00:00:00.000Z" }), "ADMIN", now)).toBe(false);
  });

  it("keeps one meant for analysts away from operators", () => {
    const forAnalysts = announcement({ roles: ["ANALISIS"] });
    expect(isShownTo(forAnalysts, "ANALISIS", now)).toBe(true);
    expect(isShownTo(forAnalysts, "PREPARATOR", now)).toBe(false);
  });

  it("refuses an end before the start", () => {
    const result = announcementSchema.safeParse({
      message: "Maintenance",
      startsAt: "2026-06-02T00:00:00.000Z",
      endsAt: "2026-06-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("the guide", () => {
  it("teaches each role only the pages it can open", () => {
    const keys = (role: Role, department: Department | null = "LAB") =>
      helpSectionsFor({ role, department }).map((s) => s.key);
    expect(keys("PREPARATOR")).toContain("mobile");
    expect(keys("PREPARATOR")).not.toContain("masterData");
    expect(keys("ADMIN")).toContain("masterData");
    expect(keys("ADMIN")).not.toContain("admin");
    expect(keys("ADMIN")).not.toContain("mobile");
    expect(keys("ANALISIS")).toEqual(expect.arrayContaining(["assay", "grade"]));
    expect(keys("SUPER_ADMIN", null)).toEqual(["users", "admin", "account"]);
    expect(keys("ADMIN", "EKSPLORASI")).toEqual(["drilling", "account"]);
  });

  it("has words for every section in both languages", () => {
    for (const section of HELP_SECTIONS) {
      for (const messages of [en, id]) {
        const entry = (messages.help.sections as Record<string, { title: string; intro: string; steps: object }>)[
          section.key
        ];
        expect(entry?.title, section.key).toBeTruthy();
        expect(entry?.intro, section.key).toBeTruthy();
        expect(Object.keys(entry?.steps ?? {}).length, section.key).toBeGreaterThan(0);
      }
    }
  });

  it("gives every section an icon, and any tip in both languages", () => {
    for (const section of HELP_SECTIONS) {
      expect(typeof section.icon, section.key).toBe("function");
      const tipIn = (messages: typeof en) =>
        "tip" in (messages.help.sections as Record<string, object>)[section.key];
      expect(tipIn(en), section.key).toBe(tipIn(id));
    }
  });

  it("points each page at its own section, and its link at a real menu item", () => {
    expect(helpSectionForPath("/lab/database")).toBe("database");
    expect(helpSectionForPath("/lab/samples/generate")).toBe("generate");
    expect(helpSectionForPath("/lab/samples/NKL-2026-00001")).toBe("sampleDetail");
    expect(helpSectionForPath("/nowhere")).toBeNull();

    // The menu is every module's manifest (src/modules/registry.ts).
    const navHrefs = MODULES.flatMap((m) => m.nav.map((item) => item.href as string));
    for (const section of HELP_SECTIONS) {
      if (section.href) expect(navHrefs, section.key).toContain(section.href);
    }
  });
});

describe("the backup", () => {
  it("is for whoever may export it, and never carries secrets", () => {
    expect(read("app", "api", "(system)", "admin", "backup", "route.ts")).toMatch(guard("exportBackup"));
    // Every module's part of it, so a new module's sheets are checked too.
    for (const key of ["lab", "system", "eksplorasi"]) {
      const sheets = read("modules", key, "backup-sheets.ts");
      expect(sheets, key).not.toMatch(/password:\s*true|totpSecret|descriptor/);
    }
  });

  it("streams several sheets into one workbook", async () => {
    const response = workbookStreamResponse({
      baseFilename: "test",
      sheets: [
        { name: "One", columns: [{ header: "A", key: "a" }], rows: async function* () { yield { a: 1 }; } },
        { name: "Two", columns: [{ header: "B", key: "b" }], rows: async function* () { yield { b: "x" }; yield { b: "y" }; } },
      ],
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await response.arrayBuffer());
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["One", "Two"]);
    expect(book.getWorksheet("Two")!.rowCount).toBe(3);
  });
});

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[admin-tools] skipped: no database reachable");
}

describe.skipIf(!reachable)("against the database", () => {
  const tag = `A${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { user: "", announcements: [] as string[], samples: [] as string[], options: [] as string[] };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: `Admin tools ${tag}`, email: `${tag.toLowerCase()}@test.invalid`, password: "secret-hash", role: "ADMIN", department: "LAB" as const },
    });
    created.user = user.id;
  });

  afterAll(async () => {
    await prisma.announcement.deleteMany({ where: { id: { in: created.announcements } } });
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.masterOption.deleteMany({ where: { id: { in: created.options } } });
    if (created.user) await prisma.user.delete({ where: { id: created.user } });
    invalidateAnnouncements();
  });

  it("serves live announcements per role, and not scheduled or ended ones", async () => {
    const make = async (data: object) => {
      const row = await prisma.announcement.create({
        data: { message: `${tag}`, createdById: created.user, ...data },
      });
      created.announcements.push(row.id);
      return row.id;
    };
    const live = await make({ tone: "WARNING" });
    const analystsOnly = await make({ roles: ["ANALISIS"] });
    const later = await make({ startsAt: new Date(Date.now() + 86_400_000) });
    const over = await make({ startsAt: new Date(Date.now() - 172_800_000), endsAt: new Date(Date.now() - 86_400_000) });
    invalidateAnnouncements();

    const forOperator = (await loadActiveAnnouncements("PREPARATOR")).map((a) => a.id);
    const forAnalyst = (await loadActiveAnnouncements("ANALISIS")).map((a) => a.id);
    expect(forOperator).toContain(live);
    expect(forOperator).not.toContain(analystsOnly);
    expect(forAnalyst).toEqual(expect.arrayContaining([live, analystsOnly]));
    expect([...forOperator, ...forAnalyst]).not.toContain(later);
    expect([...forOperator, ...forAnalyst]).not.toContain(over);
  });

  it("puts a sample in the Samples sheet with its codes, and the users without secrets", async () => {
    const place = await prisma.masterOption.create({ data: { kind: "PLACE", code: `${tag}P` } });
    created.options.push(place.id);
    const sample = await prisma.sample.create({
      data: { sampleCode: `${tag}-1`, status: "PENDING", createdById: created.user },
    });
    created.samples.push(sample.id);
    await prisma.labRecord.create({
      data: {
        sampleId: sample.id,
        labCode: `${tag}.1`,
        shiftDate: new Date("2000-01-03T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 100 + 1,
        placeId: place.id,
        ni: 1.234,
      },
    });

    const sheets = backupSheets(await backupCounts(), "Tester", new Date());
    const rowsOf = async (name: string) => {
      const sheet = sheets.find((entry) => entry.name === name)!;
      const rows = [];
      for await (const row of sheet.rows()) rows.push(row);
      return { sheet, rows };
    };

    const samples = await rowsOf("Samples");
    expect(samples.rows.find((row) => row.sampleCode === `${tag}-1`)).toMatchObject({
      labCode: `${tag}.1`,
      place: `${tag}P`,
      ni: 1.234,
    });

    const users = await rowsOf("Users");
    expect(users.sheet.columns.map((column) => column.key)).toEqual([
      "name",
      "email",
      "role",
      "department",
      "isActive",
      "createdAt",
    ]);
    expect(JSON.stringify(users.rows)).not.toContain("secret-hash");
  });
});
