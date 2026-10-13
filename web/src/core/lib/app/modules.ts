import { personaOf, type Access } from "@/core/lib/auth/permissions";
import type { AppModule } from "@/core/lib/app/module-types";
import { MODULES, type ModuleKey } from "@/modules/registry";

export { HOME_PATH } from "@/core/lib/app/home-path";
export type { ModuleKey };

/**
 * Which modules somebody may open: those that list their persona. The portal
 * shows a card for each and the side menu a group for each, so neither ever
 * offers a door the pages behind it would then refuse.
 *
 * Pure: the sidebar asks this in the browser, the portal on the server.
 */
export function canAccessModule(access: Access, key: ModuleKey): boolean {
  const persona = personaOf(access);
  const appModule: AppModule | undefined = MODULES.find((m) => m.key === key);
  return persona !== null && appModule !== undefined && appModule.personas.includes(persona);
}

export function modulesFor(access: Access): readonly AppModule[] {
  return MODULES.filter((m) => canAccessModule(access, m.key));
}
