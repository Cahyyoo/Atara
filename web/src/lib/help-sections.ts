import type { IconType } from "react-icons";
import {
  IoAppsOutline,
  IoCompassOutline,
  IoCreateOutline,
  IoFlaskOutline,
  IoListOutline,
  IoPeopleOutline,
  IoPersonCircleOutline,
  IoPhonePortraitOutline,
  IoPrintOutline,
  IoQrCodeOutline,
  IoSearchOutline,
  IoServerOutline,
  IoSettingsOutline,
  IoShieldCheckmarkOutline,
  IoStatsChartOutline,
  IoTimeOutline,
} from "react-icons/io5";
import { can, type Capability, type Access } from "@/lib/permissions";

/**
 * The guide's sections, each tied to the capability of the page it explains,
 * so a role is only taught what it can open. A null capability is a section
 * for everybody. Each carries the same icon as
 * its menu item. The words are in the message catalogues under
 * `help.sections.<key>`.
 */
export const HELP_SECTIONS = [
  { key: "dashboard", icon: IoAppsOutline, href: "/lab/dashboard", capability: "viewDashboard" },
  { key: "quickSearch", icon: IoSearchOutline, capability: "viewDashboard" },
  { key: "sampleDetail", icon: IoFlaskOutline, capability: "viewDashboard" },
  { key: "generate", icon: IoQrCodeOutline, href: "/lab/samples/generate", capability: "generateSamples" },
  { key: "labels", icon: IoPrintOutline, href: "/lab/samples/labels", capability: "printLabels" },
  { key: "database", icon: IoServerOutline, href: "/lab/database", capability: "viewDatabase" },
  { key: "dataQuality", icon: IoShieldCheckmarkOutline, href: "/lab/data-quality", capability: "viewDatabase" },
  { key: "assay", icon: IoCreateOutline, href: "/lab/assay", capability: "enterResults" },
  { key: "grade", icon: IoStatsChartOutline, href: "/lab/grade", capability: "readLabRecords" },
  { key: "masterData", icon: IoListOutline, href: "/lab/master-data", capability: "manageMasterData" },
  { key: "activity", icon: IoTimeOutline, href: "/lab/activity", capability: "viewActivity" },
  { key: "drilling", icon: IoCompassOutline, href: "/eksplorasi/drilling", capability: "manageDrilling" },
  { key: "users", icon: IoPeopleOutline, href: "/users", capability: "manageUsers" },
  { key: "admin", icon: IoSettingsOutline, href: "/admin", capability: "manageAnnouncements" },
  { key: "mobile", icon: IoPhonePortraitOutline, capability: "scanSamples" },
  { key: "account", icon: IoPersonCircleOutline, capability: null },
] as const satisfies readonly {
  key: string;
  href?: string;
  icon: IconType;
  capability: Capability | null;
}[];

export type HelpSectionKey = (typeof HELP_SECTIONS)[number]["key"];

/** Whether a section -- and the tour of the same name -- is for this person. */
export function holdsSection(access: Access, capability: Capability | null): boolean {
  return capability === null || can(access, capability);
}

export function helpSectionsFor(access: Access) {
  return HELP_SECTIONS.filter((section) => holdsSection(access, section.capability));
}

/**
 * The section that explains the page at `pathname`, for the "?" button: the
 * longest matching menu path, a sample's own page, or the top of the guide.
 */
export function helpSectionForPath(pathname: string): HelpSectionKey | null {
  let best: { key: HelpSectionKey; length: number } | null = null;
  for (const section of HELP_SECTIONS) {
    if (!("href" in section)) continue;
    const href: string = section.href;
    if ((pathname === href || pathname.startsWith(`${href}/`)) && href.length > (best?.length ?? 0)) {
      best = { key: section.key, length: href.length };
    }
  }
  if (best) return best.key;
  return pathname.startsWith("/lab/samples/") ? "sampleDetail" : null;
}
