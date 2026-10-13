import "server-only";

import { formatWitaDateTime } from "@/core/lib/wita-time";
import type { StreamedSheet } from "@/core/lib/sheets/export-response";
import type { BackupSection } from "@/core/lib/sheets/backup-kit";
import { backupSection as lab } from "@/modules/lab/backup-sheets";
import { backupSection as system } from "@/modules/system/backup-sheets";
import { backupSection as eksplorasi } from "@/modules/eksplorasi/backup-sheets";

/**
 * The whole database as one workbook: each module's sheets, in this order,
 * and an About sheet saying what is in it. A new module adds its
 * backup-sheets.ts to this list and nothing else changes.
 */
const SECTIONS: readonly BackupSection[] = [lab, system, eksplorasi];

/** How many rows each sheet will have, for the backup page and the size check. */
export async function backupCounts(): Promise<Record<string, number>> {
  const parts = await Promise.all(SECTIONS.map((section) => section.counts()));
  return Object.assign({}, ...parts);
}

export function backupSheets(counts: Record<string, number>, by: string, at: Date): StreamedSheet[] {
  return [
    ...SECTIONS.flatMap((section) => section.sheets()),
    {
      name: "About",
      columns: [
        { header: "Item", key: "item", width: 22 },
        { header: "Value", key: "value", width: 40 },
      ],
      rows: async function* () {
        const lines: [string, string | number | null][] = [
          ["Backup taken at", formatWitaDateTime(at)],
          ["Taken by", by],
          ...SECTIONS.flatMap((section) =>
            section.about.map(([label, key]): [string, number | null] => [label, counts[key] ?? null])
          ),
          ["Not included", "Passwords, authenticator secrets, face readings, sign-in sessions"],
        ];
        for (const [item, value] of lines) yield { item, value };
      },
    },
  ];
}
