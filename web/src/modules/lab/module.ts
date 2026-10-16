import {
  IoAppsOutline,
  IoCreateOutline,
  IoFlaskOutline,
  IoListOutline,
  IoSettingsOutline,
  IoPrintOutline,
  IoQrCodeOutline,
  IoServerOutline,
  IoShieldCheckmarkOutline,
  IoStatsChartOutline,
  IoTimeOutline,
} from "react-icons/io5";
import type { AppModule } from "@/core/lib/app/module-types";
import { LAB_PERSONAS } from "@/modules/lab/capabilities";
import { LAB_HELP_SECTIONS, LAB_TOURS } from "@/modules/lab/guide";
import { QuickSearch } from "@/modules/lab/components/shell/quick-search";
import { SampleOriginTracker } from "@/modules/lab/components/shell/sample-origin-tracker";

/**
 * The Lab module: sample monitoring, from barcode to report. Its pages live
 * under /lab; this manifest is how the shared shell, launcher and guide learn
 * about them (see src/modules/registry.ts).
 */
export const labModule = {
  key: "lab",
  basePath: "/lab",
  homePath: "/lab/dashboard",
  icon: IoFlaskOutline,
  personas: LAB_PERSONAS,
  nav: [
    { href: "/lab/dashboard", key: "dashboard", icon: IoAppsOutline, capability: "viewDashboard" },
    { href: "/lab/samples/generate", key: "generateSamples", icon: IoQrCodeOutline, capability: "generateSamples" },
    { href: "/lab/samples/labels", key: "reprintLabels", icon: IoPrintOutline, capability: "printLabels" },
    { href: "/lab/database", key: "sampleDatabase", icon: IoServerOutline, capability: "viewDatabase" },
    { href: "/lab/data-quality", key: "dataQuality", icon: IoShieldCheckmarkOutline, capability: "viewDatabase" },
    { href: "/lab/assay", key: "assayEntry", icon: IoCreateOutline, capability: "enterResults" },
    { href: "/lab/grade", key: "gradeControl", icon: IoStatsChartOutline, capability: "readLabRecords" },
    { href: "/lab/master-data", key: "masterData", icon: IoListOutline, capability: "manageMasterData" },
    { href: "/lab/activity", key: "activity", icon: IoTimeOutline, capability: "viewActivity" },
    { href: "/lab/settings", key: "labSettings", icon: IoSettingsOutline, capability: "manageLabSettings" },
  ],
  helpSections: LAB_HELP_SECTIONS,
  tours: LAB_TOURS,
  // A sample's own page has no menu entry; its section explains it.
  helpFallbacks: [{ prefix: "/lab/samples/", section: "sampleDetail" }],
  shell: { header: QuickSearch, background: SampleOriginTracker },
} as const satisfies AppModule;
