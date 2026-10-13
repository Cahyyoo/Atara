/** The system module's heavy operations, capped per process (see HeavyGate). */
import "server-only";
import { HeavyGate } from "@/core/lib/heavy-gate";

/** The whole-database backup: one at a time. */
export const backupGate = new HeavyGate("backup", 1);
