import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/api-auth";
import { toLabRecordDTO } from "@/lib/lab-record";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    await requireSession(request);

    const { code } = await params;

    const sample = await prisma.sample.findUnique({
      where: { sampleCode: decodeURIComponent(code) },
      include: {
        currentStage: true,
        labRecord: true,
        createdBy: { select: { id: true, name: true, email: true } },
        logs: {
          orderBy: { scannedAt: "asc" },
          include: {
            stage: true,
            operator: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!sample) {
      return jsonError("Sample not found.", 404);
    }

    return jsonSuccess({
      ...sample,
      labRecord: sample.labRecord ? toLabRecordDTO(sample.labRecord) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
