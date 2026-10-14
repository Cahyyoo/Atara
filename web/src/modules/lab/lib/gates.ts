/** The lab's heavy operations, each capped per process (see HeavyGate). */
import "server-only";
import { HeavyGate } from "@/core/lib/heavy-gate";

/** The Sample Database export: at most two at a time per process. */
export const labRecordExportGate = new HeavyGate("Sample Database export", 2);

/**
 * Text searches and very deep pages of the record lists: each reads every
 * record (seconds idle, a minute under load), and forty people doing it at
 * once held every database connection, so preparators' scans waited and
 * failed. A few at a time per process; the rest are told to retry.
 */
export const listScanGate = new HeavyGate("search", 4);

/** Rows skipped beyond which a page counts as a full read, like a search. */
export const DEEP_OFFSET_ROWS = 10_000;
