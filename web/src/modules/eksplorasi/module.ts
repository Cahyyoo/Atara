import { IoCompassOutline } from "react-icons/io5";
import type { AppModule } from "@/core/lib/app/module-types";

/**
 * The Eksplorasi module: drilling data. Its pages live under /eksplorasi;
 * this manifest is how the shared shell, portal and guide learn about them
 * (see src/modules/registry.ts).
 */
export const eksplorasiModule = {
  key: "eksplorasi",
  basePath: "/eksplorasi",
  homePath: "/eksplorasi/drilling",
  icon: IoCompassOutline,
  personas: ["EKSPLORASI_ADMIN"],
  nav: [{ href: "/eksplorasi/drilling", key: "drilling", icon: IoCompassOutline, capability: "manageDrilling" }],
  helpSections: [
    { key: "drilling", icon: IoCompassOutline, href: "/eksplorasi/drilling", capability: "manageDrilling" },
  ],
  tours: [],
} as const satisfies AppModule;
