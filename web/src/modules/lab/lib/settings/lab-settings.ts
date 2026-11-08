import "server-only";

import { prisma } from "@/core/lib/prisma";
import { TtlCache } from "@/core/lib/ttl-cache";

/**
 * The lab admin's switches, with the value each holds when nobody has set it.
 *
 * One row per key in `lab_settings`; a key with no row is its default here, so
 * adding a setting is a line in this object rather than a migration.
 */
export interface LabSettings {
  /**
   * Whether the mobile app is sent a sample's Sample ID. Off, the app shows
   * only that a sample has one; the website and the identity form still show
   * it. On by default, as it always was.
   */
  mobileShowSampleIdent: boolean;
}

export const DEFAULT_LAB_SETTINGS: LabSettings = {
  mobileShowSampleIdent: true,
};

/**
 * Fifteen seconds, like the floor board: every scan asks, and a change made on
 * the website reaching the phones within a few scans is soon enough.
 */
const cache = new TtlCache<LabSettings>(15_000, 1);

async function readSettings(): Promise<LabSettings> {
  const rows = await prisma.labSetting.findMany();
  const settings: LabSettings = { ...DEFAULT_LAB_SETTINGS };
  for (const row of rows) {
    if (row.key === "mobileShowSampleIdent" && typeof row.value === "boolean") {
      settings.mobileShowSampleIdent = row.value;
    }
  }
  return settings;
}

export function getLabSettings(): Promise<LabSettings> {
  return cache.get("settings", readSettings);
}

/** Writes the settings given and leaves the rest alone. */
export async function setLabSettings(update: Partial<LabSettings>, userId: string): Promise<LabSettings> {
  await prisma.$transaction(
    Object.entries(update)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) =>
        prisma.labSetting.upsert({
          where: { key },
          create: { key, value, updatedById: userId },
          update: { value, updatedById: userId },
        })
      )
  );
  cache.invalidate();
  return getLabSettings();
}
