import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Department, Role } from "@/lib/permissions";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import { TOURS, tourCapability, toursFor } from "@/lib/tours";
import { HELP_SECTIONS } from "@/lib/help-sections";

/**
 * The tours point at elements by name. A renamed or removed element would
 * leave a step pointing at nothing, silently, so every name is checked
 * against the source: each must appear as a `data-tour` (or the `tourId`
 * passed to the shared export button) somewhere under src.
 */

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

/** Every name given to `data-tour` or `tourId`, including `cond ? "a" : undefined`. */
function taggedNames(): Set<string> {
  const names = new Set<string>();
  for (const file of sourceFiles(join(process.cwd(), "src"))) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!/data-tour=|tourId=/.test(line)) continue;
      for (const match of line.matchAll(/"([a-z]+(?:-[a-z]+)+)"/g)) names.add(match[1]);
    }
  }
  return names;
}

type StepText = Record<string, { title: string; body: string }>;

describe("the guided tours", () => {
  const tagged = taggedNames();

  it("only point at elements that exist", () => {
    const missing = TOURS.flatMap((tour) =>
      tour.steps
        .map((step) => step.target)
        .filter((target): target is string => target !== null && !tagged.has(target))
        .map((target) => `${tour.key}: ${target}`)
    );
    expect(missing).toEqual([]);
  });

  it("have words for every step in both languages, and no more", () => {
    for (const tour of TOURS) {
      for (const messages of [en, id]) {
        const text = (messages.tours as Record<string, StepText>)[tour.key];
        expect(Object.keys(text ?? {}).length, tour.key).toBe(tour.steps.length);
        for (const [n, step] of Object.entries(text)) {
          expect(step.title, `${tour.key}.${n}`).toBeTruthy();
          expect(step.body, `${tour.key}.${n}`).toBeTruthy();
        }
      }
    }
  });

  it("belong to a section of the guide, with its capability", () => {
    const sections = new Set(HELP_SECTIONS.map((section) => section.key));
    for (const tour of TOURS) {
      expect(sections.has(tour.key), tour.key).toBe(true);
      expect(tourCapability(tour.key)).toBe(HELP_SECTIONS.find((s) => s.key === tour.key)!.capability);
    }
  });

  it("offer each role only the pages it can open", () => {
    const keys = (role: Role, department: Department | null = "LAB") =>
      toursFor({ role, department }).map((tour) => tour.key);
    expect(keys("OPERATOR")).toEqual(["dashboard", "quickSearch", "sampleDetail", "account"]);
    expect(keys("OPERATOR")).not.toContain("masterData");
    expect(keys("ANALISIS")).toEqual(expect.arrayContaining(["assay", "grade"]));
    expect(keys("DATABASE")).toEqual(expect.arrayContaining(["generate", "labels", "database", "dataQuality"]));
    expect(keys("ADMIN")).toEqual(expect.arrayContaining(["masterData", "users", "activity"]));
    expect(keys("SUPER_ADMIN", null)).toEqual(expect.arrayContaining(["users", "admin", "account"]));
    expect(keys("ADMIN", "EKSPLORASI")).toEqual(["account"]);
  });
});
