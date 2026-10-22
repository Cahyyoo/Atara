import {
  IoCompassOutline,
  IoCopyOutline,
  IoEllipseOutline,
  IoRibbonOutline,
  IoServerOutline,
  IoStatsChartOutline,
} from "react-icons/io5";
import type { AppModule } from "@/core/lib/app/module-types";

/**
 * The Eksplorasi module: the assay data source and its QC samples. Its pages
 * live under /eksplorasi; this manifest is how the shared shell, portal and
 * guide learn about them (see src/modules/registry.ts).
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
  ],
  helpSections: [
    { key: "qcDashboard", icon: IoStatsChartOutline, href: "/eksplorasi/dashboard", capability: "manageExplorationData" },
    { key: "dataSource", icon: IoServerOutline, href: "/eksplorasi/data-source", capability: "manageExplorationData" },
  ],
  tours: [],
} as const satisfies AppModule;
