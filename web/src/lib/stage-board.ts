import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadStages } from "@/lib/stages-cache";
import { ACTIVE_SAMPLE } from "@/lib/soft-delete";
import { DEFAULT_SLA_HOURS } from "@/lib/sla";
import { TtlCache } from "@/lib/ttl-cache";

const HOUR_MS = 60 * 60 * 1000;

/** Cards per column; the header still counts every sample. */
export const BOARD_CARDS_PER_COLUMN = 30;

/** How far back the last column ("done") looks. */
export const BOARD_DONE_HOURS = 24;

export interface BoardCard {
  sampleCode: string;
  labCode: string | null;
  sampleIdent: string | null;
  /** When it entered this column's stage. */
  since: string;
  hours: number;
  overdue: boolean;
}

export interface BoardColumn {
  /** The stage's id. */
  id: string;
  /** "done" for the last stage, which shows what finished lately. */
  kind: "stage" | "done";
  stageKey: string | null;
  stageName: string | null;
  count: number;
  overdue: number;
  cards: BoardCard[];
}

export interface StageBoard {
  generatedAt: string;
  slaHours: number;
  columns: BoardColumn[];
}

const CARD_SELECT = {
  sampleCode: true,
  createdAt: true,
  stageEnteredAt: true,
  labRecord: { select: { labCode: true, sampleIdent: true } },
} as const satisfies Prisma.SampleSelect;

type CardRow = Prisma.SampleGetPayload<{ select: typeof CARD_SELECT }>;

function toCard(row: CardRow, since: Date, now: Date, canBeOverdue: boolean): BoardCard {
  const hours = Math.max(0, Math.round(((now.getTime() - since.getTime()) / HOUR_MS) * 10) / 10);
  return {
    sampleCode: row.sampleCode,
    labCode: row.labRecord?.labCode ?? null,
    sampleIdent: row.labRecord?.sampleIdent ?? null,
    since: since.toISOString(),
    hours,
    overdue: canBeOverdue && hours > DEFAULT_SLA_HOURS,
  };
}

/**
 * Where every live sample is right now, one column per stage: what the TV
 * view on the lab's wall monitor shows.
 *
 * Not limited to a date window like the dashboard: this is the floor as it
 * stands. Samples not received yet have no stage and are left out. Each
 * stage holds what is sitting in it, longest-waiting first, flagged once
 * past the SLA; the final stage holds what finished in the last day, since
 * everything that ever finished would bury it.
 */
export async function buildStageBoard(now: Date = new Date()): Promise<StageBoard> {
  const stages = await loadStages();
  const slaCutoff = new Date(now.getTime() - DEFAULT_SLA_HOURS * HOUR_MS);
  const doneSince = new Date(now.getTime() - BOARD_DONE_HOURS * HOUR_MS);
  const last = stages.at(-1);

  const columns = stages.map(async (stage): Promise<BoardColumn> => {
    if (stage.id === last?.id) {
      const where = {
        ...ACTIVE_SAMPLE,
        status: "COMPLETED",
        stageEnteredAt: { gte: doneSince },
      } satisfies Prisma.SampleWhereInput;
      const [count, rows] = await Promise.all([
        prisma.sample.count({ where }),
        prisma.sample.findMany({
          where,
          select: CARD_SELECT,
          orderBy: { stageEnteredAt: "desc" },
          take: BOARD_CARDS_PER_COLUMN,
        }),
      ]);
      return {
        id: stage.id,
        kind: "done",
        stageKey: stage.key,
        stageName: stage.name,
        count,
        overdue: 0,
        cards: rows.map((row) => toCard(row, row.stageEnteredAt ?? row.createdAt, now, false)),
      };
    }

    const where = {
      ...ACTIVE_SAMPLE,
      currentStageId: stage.id,
      status: { not: "COMPLETED" },
    } satisfies Prisma.SampleWhereInput;
    const [count, overdue, rows] = await Promise.all([
      prisma.sample.count({ where }),
      prisma.sample.count({ where: { ...where, stageEnteredAt: { lt: slaCutoff } } }),
      prisma.sample.findMany({
        where,
        select: CARD_SELECT,
        orderBy: { stageEnteredAt: "asc" },
        take: BOARD_CARDS_PER_COLUMN,
      }),
    ]);
    return {
      id: stage.id,
      kind: "stage",
      stageKey: stage.key,
      stageName: stage.name,
      count,
      overdue,
      cards: rows.map((row) => toCard(row, row.stageEnteredAt ?? row.createdAt, now, true)),
    };
  });

  return {
    generatedAt: now.toISOString(),
    slaHours: DEFAULT_SLA_HOURS,
    columns: await Promise.all(columns),
  };
}

/**
 * Fifteen seconds: shorter than the dashboard's thirty, because this is what
 * the wall monitor shows; long enough that several monitors share one
 * computation.
 */
const cache = new TtlCache<StageBoard>(15_000, 1);

export function loadStageBoard(): Promise<StageBoard> {
  return cache.get("board", () => buildStageBoard());
}
