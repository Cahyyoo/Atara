import type { IconType } from "react-icons";
import {
  IoAppsOutline,
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
import { can, type Capability, type Role } from "@/lib/permissions";

/**
 * The guide's sections, each tied to the capability of the page it explains,
 * so a role is only taught what it can open. Each carries the same icon as
 * its menu item. The words are in the message catalogues under
 * `help.sections.<key>`.
 */
export const HELP_SECTIONS = [
  { key: "dashboard", icon: IoAppsOutline, href: "/dashboard", capability: "viewDashboard" },
  { key: "quickSearch", icon: IoSearchOutline, capability: "viewDashboard" },
  { key: "sampleDetail", icon: IoFlaskOutline, capability: "viewDashboard" },
  { key: "generate", icon: IoQrCodeOutline, href: "/samples/generate", capability: "generateSamples" },
  { key: "labels", icon: IoPrintOutline, href: "/samples/labels", capability: "printLabels" },
  { key: "database", icon: IoServerOutline, href: "/database", capability: "viewDatabase" },
  { key: "dataQuality", icon: IoShieldCheckmarkOutline, href: "/data-quality", capability: "viewDatabase" },
  { key: "assay", icon: IoCreateOutline, href: "/assay", capability: "enterResults" },
  { key: "grade", icon: IoStatsChartOutline, href: "/grade", capability: "readLabRecords" },
  { key: "masterData", icon: IoListOutline, href: "/master-data", capability: "manageMasterData" },
  { key: "activity", icon: IoTimeOutline, href: "/activity", capability: "viewActivity" },
  { key: "users", icon: IoPeopleOutline, href: "/users", capability: "manageUsers" },
  { key: "admin", icon: IoSettingsOutline, href: "/admin", capability: "manageAnnouncements" },
  { key: "mobile", icon: IoPhonePortraitOutline, capability: "scanSamples" },
  { key: "account", icon: IoPersonCircleOutline, capability: "viewDashboard" },
] as const satisfies readonly {
  key: string;
  href?: string;
  icon: IconType;
  capability: Capability;
}[];

export type HelpSectionKey = (typeof HELP_SECTIONS)[number]["key"];

export function helpSectionsFor(role: Role) {
  return HELP_SECTIONS.filter((section) => can(role, section.capability));
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
  return pathname.startsWith("/samples/") ? "sampleDetail" : null;
}
