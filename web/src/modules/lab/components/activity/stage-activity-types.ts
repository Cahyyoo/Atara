import type { PaginationDTO } from "@/core/types";

/** What /api/stage-activity answers: one page of scans, the per-person totals, and who can be picked. */
export interface ActivityLog {
  id: string;
  scannedAt: string;
  isCorrection: boolean;
  notes: string | null;
  stageId: string;
  stageKey: string;
  stageName: string;
  preparatorId: string;
  preparatorName: string;
  sampleId: string;
  sampleCode: string;
}

export interface PreparatorTotal {
  preparatorId: string;
  preparatorName: string;
  total: number;
  byStage: Record<string, number>;
}

export interface ActivityResponse {
  logs: ActivityLog[];
  summary: PreparatorTotal[];
  preparators: { id: string; name: string }[];
  pagination: PaginationDTO;
}
