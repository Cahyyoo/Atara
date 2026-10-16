import {
  IoAppsOutline,
  IoCreateOutline,
  IoFlaskOutline,
  IoListOutline,
  IoPhonePortraitOutline,
  IoPrintOutline,
  IoQrCodeOutline,
  IoSearchOutline,
  IoServerOutline,
  IoStatsChartOutline,
  IoTimeOutline,
} from "react-icons/io5";
import type { HelpSection, Tour } from "@/core/lib/app/module-types";
import { withBasePath } from "@/core/lib/http/base-path";
import type { ApiResult } from "@/core/types";
import { samplePath } from "@/modules/lab/lib/samples/sample-ident";
import type { SampleListItemDTO } from "@/modules/lab/types";

/**
 * The lab's part of the guide and its guided tours. Each section is tied to
 * the capability of the page it explains, so a role is only taught what it
 * can open; each carries the icon of its menu item. The words are under
 * `help.sections.<key>` and `tours.<key>`.
 */
export const LAB_HELP_SECTIONS: readonly HelpSection[] = [
  { key: "dashboard", icon: IoAppsOutline, href: "/lab/dashboard", capability: "viewDashboard" },
  { key: "quickSearch", icon: IoSearchOutline, capability: "viewDashboard" },
  { key: "sampleDetail", icon: IoFlaskOutline, capability: "viewDashboard" },
  { key: "generate", icon: IoQrCodeOutline, href: "/lab/samples/generate", capability: "generateSamples" },
  { key: "labels", icon: IoPrintOutline, href: "/lab/samples/labels", capability: "printLabels" },
  { key: "database", icon: IoServerOutline, href: "/lab/database", capability: "viewDatabase" },
  { key: "assay", icon: IoCreateOutline, href: "/lab/assay", capability: "enterResults" },
  { key: "grade", icon: IoStatsChartOutline, href: "/lab/grade", capability: "readLabRecords" },
  { key: "masterData", icon: IoListOutline, href: "/lab/master-data", capability: "manageMasterData" },
  { key: "activity", icon: IoTimeOutline, href: "/lab/activity", capability: "viewActivity" },
  { key: "mobile", icon: IoPhonePortraitOutline, capability: "scanSamples" },
];

/** A sample's own page needs a sample: the tour opens the newest one. */
async function newestSamplePath(): Promise<string | null> {
  try {
    const response = await fetch(withBasePath("/api/samples?pageSize=1&sort=createdAt&order=desc"));
    const body: ApiResult<{ samples: SampleListItemDTO[] }> = await response.json();
    const newest = body.success ? body.data.samples[0] : undefined;
    return newest ? samplePath(newest.sampleCode) : null;
  } catch {
    return null;
  }
}

export const LAB_TOURS: readonly Tour[] = [
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
    path: "/lab/samples",
    resolvePath: newestSamplePath,
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
];
