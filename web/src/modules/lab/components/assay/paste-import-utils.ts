import type { ImportPreviewRow } from "@/modules/lab/types";

/** Long enough to let a paste settle, short enough that the preview feels immediate. */
export const PREVIEW_DELAY_MS = 400;

/** Problems first: they are what somebody has to act on before saving. */
export const STATUS_ORDER: Record<ImportPreviewRow["status"], number> = {
  invalid: 0,
  unknown: 1,
  update: 2,
  create: 3,
  unchanged: 4,
};

export function formatValue(value: number | string | null): string {
  return value === null || value === "" ? "—" : String(value);
}
