import {
  IoCompassOutline,
  IoCopyOutline,
  IoEllipseOutline,
  IoListOutline,
  IoRibbonOutline,
  IoServerOutline,
  IoStatsChartOutline,
} from "react-icons/io5";
import type { AppModule } from "@/core/lib/app/module-types";

/**
 * The Eksplorasi module: the assay data source, its QC samples, and the CRM
 * List they are judged against. Its pages live under /eksplorasi; this
 * manifest is how the shared shell, portal and guide learn about them (see
 * src/modules/registry.ts).
 */
export const eksplorasiModule = {
  key: "eksplorasi",
  basePath: "/eksplorasi",
  homePath: "/eksplorasi/dashboard",
  icon: IoCompassOutline,
  personas: ["EKSPLORASI_ADMIN"],
  nav: [
    { href: "/eksplorasi/dashboard", key: "explorationDashboard", icon: IoStatsChartOutline, capability: "manageExplorationData" },
    { href: "/eksplorasi/data-source", key: "dataSource", icon: IoServerOutline, capability: "manageExplorationData" },
    { href: "/eksplorasi/standard", key: "qcStandard", icon: IoRibbonOutline, capability: "manageExplorationData" },
    { href: "/eksplorasi/blank", key: "qcBlank", icon: IoEllipseOutline, capability: "manageExplorationData" },
    { href: "/eksplorasi/duplicate", key: "qcDuplicate", icon: IoCopyOutline, capability: "manageExplorationData" },
    // The reference values the QC lists are judged against: last, after the lists themselves.
    { href: "/eksplorasi/crm-list", key: "crmList", icon: IoListOutline, capability: "manageExplorationData" },
  ],
  helpSections: [
    { key: "qcDashboard", icon: IoStatsChartOutline, href: "/eksplorasi/dashboard", capability: "manageExplorationData" },
    { key: "dataSource", icon: IoServerOutline, href: "/eksplorasi/data-source", capability: "manageExplorationData" },
  ],
  tours: [],
} as const satisfies AppModule;
