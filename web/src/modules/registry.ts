import type { AppModule } from "@/core/lib/app/module-types";
import { labModule } from "@/modules/lab/module";
import { eksplorasiModule } from "@/modules/eksplorasi/module";
import { systemModule } from "@/modules/system/module";

/**
 * Every module of the super app, in menu order: the one place that knows
 * them all. The side menu, the portal, the guide, the tours and the shell
 * extras are all built from this list, so adding a module is a folder under
 * src/modules plus one line here (see docs/MODULES.md).
 */
export const MODULES = [labModule, eksplorasiModule, systemModule] as const satisfies readonly AppModule[];

export type ModuleKey = (typeof MODULES)[number]["key"];
