/** "31 h" under two days, "3 d 4 h" beyond, so a stuck sample reads as stuck. */
export function formatWait(hours: number, t: (key: string, values: Record<string, number>) => string) {
  if (hours < 48) return t("hours", { hours: Math.round(hours) });
  return t("days", { days: Math.floor(hours / 24), hours: Math.round(hours % 24) });
}
