import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { faceQueueStatus, isFaceServiceUp } from "@/core/lib/face/face-service";
import { TtlCache } from "@/core/lib/ttl-cache";

/**
 * Is this process able to serve?
 *
 * Unauthenticated, because the thing that asks is a load balancer or a
 * monitor with no account. Returns nothing secret: three words about the
 * database and the face service, the size of the face queue, and an uptime.
 *
 * Both probes are memoised for five seconds. A monitor that asks every second
 * would otherwise spend one pool connection per probe -- and the moment the
 * pool is what is wrong, the probes would be part of the problem they are
 * reporting.
 */

export const dynamic = "force-dynamic";

type DbState = "ok" | "down" | "saturated";
type FaceState = "ok" | "down";

const PROBE_TTL_MS = 5_000;
const PROBE_TIMEOUT_MS = 1_000;

const dbProbe = new TtlCache<DbState>(PROBE_TTL_MS, 1);
const faceProbe = new TtlCache<FaceState>(PROBE_TTL_MS, 1);
const startedAt = Date.now();

async function probeDb(): Promise<DbState> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("probe-timeout")), PROBE_TIMEOUT_MS)
  );
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return "ok";
  } catch (error) {
    // No free connection is a different answer from no database: the first
    // means "shed load", the second means "page somebody".
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2024") {
      return "saturated";
    }
    return "down";
  }
}

export async function GET() {
  const [db, face] = await Promise.all([
    dbProbe.get("db", probeDb),
    faceProbe.get("face", async () => ((await isFaceServiceUp()) ? "ok" : "down")),
  ]);

  const body = {
    ok: db === "ok",
    db,
    face,
    faceQueue: faceQueueStatus(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  };

  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
