/** The dashboard's sections, one tab each, in their order. */
export const DASHBOARD_TABS = ["standard", "blank", "duplicate"] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

/** A tab named in the address (?tab=blank), or the first for anything else. */
export function dashboardTabOf(value: string | string[] | undefined | null): DashboardTab {
  const name = Array.isArray(value) ? value[0] : value;
  return (DASHBOARD_TABS as readonly string[]).includes(name ?? "") ? (name as DashboardTab) : "standard";
}
