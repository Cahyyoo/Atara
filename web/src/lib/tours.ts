import type { Capability, Access } from "@/lib/permissions";
import { HELP_SECTIONS, holdsSection, type HelpSectionKey } from "@/lib/help-sections";

/**
 * The guided tours: for each part of the guide that has a page, the elements
 * to walk through on that page, in order. Each step points at an element by
 * its `data-tour` attribute; the words are in `tours.<key>.<n>`.
 *
 * The tour only points. It never clicks anything for the person, and a step
 * whose element would save something says so (`savesData`).
 */
export interface TourStep {
  /** The `data-tour` value to highlight; null for a step with no element. */
  target: string | null;
  /** Move on by itself once the person clicks the highlighted element. */
  advanceOnClick?: boolean;
  /** Clicking this saves or changes data: shown with a warning. */
  savesData?: boolean;
  /** May legitimately be missing (no data yet, role, screen size). */
  optional?: boolean;
}

/** Where a tour opens: a page, or the most recent sample's own page. */
export type TourPath = `/${string}` | "latest-sample";

export interface Tour {
  key: HelpSectionKey;
  path: TourPath;
  steps: TourStep[];
}

export const TOURS: readonly Tour[] = [
  {
    key: "dashboard",
    path: "/lab/dashboard",
    steps: [
      { target: "dashboard-range" },
      { target: "dashboard-filters", advanceOnClick: true },
      { target: "dashboard-filter-panel", optional: true },
      { target: "dashboard-refresh" },
      { target: "dashboard-kpis", optional: true },
      { target: "dashboard-attention", optional: true },
      { target: "dashboard-tv" },
      { target: "dashboard-report", optional: true },
    ],
  },
  {
    key: "quickSearch",
    path: "/lab/dashboard",
    steps: [{ target: "quick-search" }, { target: "help-button" }],
  },
  {
    key: "sampleDetail",
    path: "latest-sample",
    steps: [
      { target: "sample-header" },
      { target: "sample-summary" },
      { target: "sample-labrecord", optional: true },
      { target: "sample-timeline" },
      { target: "sample-print", optional: true },
      { target: "sample-correct", optional: true, savesData: true },
    ],
  },
  {
    key: "generate",
    path: "/lab/samples/generate",
    steps: [
      { target: "generate-quantity" },
      { target: "generate-submit", savesData: true },
      { target: "generate-next" },
    ],
  },
  {
    key: "labels",
    path: "/lab/samples/labels",
    steps: [
      { target: "labels-search" },
      { target: "labels-select", advanceOnClick: true },
      { target: "labels-settings" },
      { target: "labels-print" },
    ],
  },
  {
    key: "database",
    path: "/lab/database",
    steps: [
      { target: "records-search" },
      { target: "records-results", optional: true },
      { target: "records-ident", optional: true },
      { target: "records-columns" },
      { target: "records-view", optional: true },
      { target: "records-export", optional: true },
      { target: "records-row", optional: true },
    ],
  },
  {
    key: "dataQuality",
    path: "/lab/data-quality",
    steps: [
      { target: "quality-cards" },
      { target: "quality-filters" },
      { target: "quality-table" },
      { target: "quality-export", optional: true },
    ],
  },
  {
    key: "assay",
    path: "/lab/assay",
    steps: [
      { target: "assay-results" },
      { target: "records-row-select", optional: true, advanceOnClick: true },
      { target: "assay-actions", optional: true },
      { target: "assay-import" },
    ],
  },
  {
    key: "grade",
    path: "/lab/grade",
    steps: [
      { target: "grade-range" },
      { target: "grade-group" },
      { target: "grade-chart", optional: true },
      { target: "grade-table", optional: true },
      { target: "grade-download" },
    ],
  },
  {
    key: "masterData",
    path: "/lab/master-data",
    steps: [
      { target: "master-card" },
      { target: "master-add", savesData: true },
      { target: "master-edit", optional: true },
      { target: "master-retire", optional: true, savesData: true },
      { target: "master-delete", optional: true, savesData: true },
    ],
  },
  {
    key: "activity",
    path: "/lab/activity",
    steps: [
      { target: "activity-summary", optional: true },
      { target: "activity-filters" },
      { target: "activity-export" },
      { target: "activity-table" },
    ],
  },
  {
    key: "users",
    path: "/users",
    steps: [
      { target: "users-search" },
      { target: "users-add", savesData: true },
      { target: "users-verification" },
      { target: "users-edit", optional: true },
      { target: "users-more", optional: true },
    ],
  },
  {
    key: "admin",
    path: "/admin",
    steps: [
      { target: "admin-message" },
      { target: "admin-audience" },
      { target: "admin-times" },
      { target: "admin-publish", savesData: true },
      { target: "admin-backup", optional: true },
    ],
  },
  {
    key: "account",
    path: "/home",
    steps: [{ target: "user-menu" }, { target: "sidebar-nav", optional: true }],
  },
];

const CAPABILITY = Object.fromEntries(
  HELP_SECTIONS.map((section) => [section.key, section.capability])
) as Record<HelpSectionKey, Capability | null>;

/** The capability a tour needs: the same as its section of the guide. */
export function tourCapability(key: HelpSectionKey): Capability | null {
  return CAPABILITY[key];
}

export function tourFor(key: string | null | undefined): Tour | null {
  return TOURS.find((tour) => tour.key === key) ?? null;
}

export function toursFor(access: Access): Tour[] {
  return TOURS.filter((tour) => holdsSection(access, tourCapability(tour.key)));
}

/** The URL parameters a running tour lives in. */
export const TOUR_PARAM = "tour";
export const TOUR_STEP_PARAM = "step";

/** Where to send somebody to start a tour on a known page. */
export function tourHref(tour: Tour, path: string = tour.path): string {
  return `${path}?${TOUR_PARAM}=${tour.key}`;
}
