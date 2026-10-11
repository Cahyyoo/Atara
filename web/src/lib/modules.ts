import type { IconType } from "react-icons";
import { IoCompassOutline, IoFlaskOutline, IoShieldHalfOutline } from "react-icons/io5";
import { personaOf, type Access, type Persona } from "@/lib/permissions";

/**
 * The modules of the super app, in one table.
 *
 * Each department is a module with its own pages under its own path, and the
 * super admin's system tools are one more. The portal (/home) shows a card per
 * module somebody may open, and the sidebar groups its menu by them.
 *
 * Who may open a module is the same question as who holds its capabilities
 * (permissions.ts): a module only lists the personas that work in it, so the
 * portal never offers a door the pages behind it would then refuse.
 *
 * Pure: the sidebar asks this in the browser, the portal on the server.
 */

/** Where everybody lands after signing in, and where a refused page sends them. */
export const HOME_PATH = "/home";

export const MODULE_KEYS = ["lab", "eksplorasi", "system"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface AppModule {
  key: ModuleKey;
  /** Every page of the module lives under this path. */
  basePath: string;
  /** The page its card and its menu heading open. */
  homePath: string;
  icon: IconType;
  personas: readonly Persona[];
}

export const MODULES = [
  {
    key: "lab",
    basePath: "/lab",
    homePath: "/lab/dashboard",
    icon: IoFlaskOutline,
    personas: ["LAB_ADMIN", "DATABASE", "ANALISIS", "OPERATOR"],
  },
  {
    key: "eksplorasi",
    basePath: "/eksplorasi",
    homePath: "/eksplorasi/drilling",
    icon: IoCompassOutline,
    personas: ["EKSPLORASI_ADMIN"],
  },
  {
    key: "system",
    basePath: "/admin",
    homePath: "/admin",
    icon: IoShieldHalfOutline,
    personas: ["SUPER_ADMIN"],
  },
] as const satisfies readonly AppModule[];

export function canAccessModule(access: Access, key: ModuleKey): boolean {
  const persona = personaOf(access);
  const appModule: AppModule | undefined = MODULES.find((m) => m.key === key);
  return persona !== null && appModule !== undefined && appModule.personas.includes(persona);
}

export function modulesFor(access: Access): readonly AppModule[] {
  return MODULES.filter((m) => canAccessModule(access, m.key));
}

/** Prefixes a path inside the lab module: `labPath("/database")` is `/lab/database`. */
export function labPath(path: `/${string}`): string {
  return `/lab${path}`;
}
