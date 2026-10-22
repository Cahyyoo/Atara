/** The Eksplorasi module's heavy operations, capped per process (see HeavyGate). */
import "server-only";
import { HeavyGate } from "@/core/lib/heavy-gate";

/**
 * A data-source import, preview or write: tens of thousands of rows parsed,
 * looked up and written. One at a time per process.
 */
export const dataSourceImportGate = new HeavyGate("data source import", 1);
