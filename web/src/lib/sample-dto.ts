import type { Prisma } from "@prisma/client";
import type { SampleListItemDTO } from "@/types";

/** The relations every sample list needs, in one place. */
export const sampleListInclude = {
  currentStage: true,
  createdBy: { select: { id: true, name: true } },
  // Two columns off a one-to-one relation. Without them no column in the sample
  // list says what a row actually is — which is what the batch name used to do.
  labRecord: { select: { labCode: true, sampleIdent: true } },
} satisfies Prisma.SampleInclude;

type SampleWithRelations = Prisma.SampleGetPayload<{ include: typeof sampleListInclude }>;

export function toSampleListItemDTO(sample: SampleWithRelations): SampleListItemDTO {
  return {
    id: sample.id,
    sampleCode: sample.sampleCode,
    labCode: sample.labRecord?.labCode ?? null,
    sampleIdent: sample.labRecord?.sampleIdent ?? null,
    status: sample.status,
    currentStageId: sample.currentStageId,
    currentStage: sample.currentStage,
    createdBy: sample.createdBy,
    createdAt: sample.createdAt.toISOString(),
    updatedAt: sample.updatedAt.toISOString(),
  };
}
