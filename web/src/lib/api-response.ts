import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

/** An error whose message and status are safe to return to the client. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /**
     * Machine-readable tag for clients that must tell two refusals with the
     * same status apart. Matching on the message text works until someone
     * rewords it or translates it; this does not.
     */
    public readonly code?: string,
    /** Safe, structured facts for the client to word its own message from. */
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonSuccess<T>(data: T, init?: number) {
  return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

export function jsonError(
  message: string,
  status: number = 400,
  details?: unknown,
  code?: string,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    { success: false, error: message, details, code },
    { status, headers }
  );
}

/** The client-visible tag for "come back in a moment", so a queue can retry on it. */
export const BUSY_CODE = "BUSY";

/**
 * Prisma's ways of saying the database could not be reached *right now*.
 *
 *   P2024  the pool had no free connection within pool_timeout
 *   P2028  an interactive transaction could not start within maxWait
 *   P1001  the server did not answer
 *   P1008  a query timed out
 *   P1017  the server closed the connection
 *
 * None of these is the caller's fault and none is a bug here; they are what
 * saturation looks like. They used to fall through to the 500 below, which
 * told the mobile queue "do not retry" and told an operator "something broke"
 * about a scan that would have succeeded two seconds later.
 */
const TRANSIENT_DB_CODES = new Set(["P2024", "P2028", "P1001", "P1008", "P1017"]);

function busy() {
  return jsonError("The server is busy. Please retry in a moment.", 503, undefined, BUSY_CODE, {
    "Retry-After": "2",
  });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return jsonError(error.message, error.status, error.details, error.code);
  }
  if (error instanceof ZodError) {
    return jsonError("The submitted data is invalid.", 422, error.flatten());
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Otherwise a duplicate key or a missing row surfaces as "unexpected".
    if (error.code === "P2002") {
      return jsonError("That value is already taken.", 409);
    }
    if (error.code === "P2025") {
      return jsonError("The record no longer exists.", 404);
    }
    if (TRANSIENT_DB_CODES.has(error.code)) {
      // Worth a line, not a stack: under load this can happen many times a
      // second, and the stack says nothing the code did not.
      console.warn(`[db] ${error.code}: ${error.message.split("\n")[0]}`);
      return busy();
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.warn(`[db] not reachable: ${error.message.split("\n")[0]}`);
    return busy();
  }
  // Anything else is unexpected: log the detail, but never leak it to the client.
  console.error(error);
  return jsonError("An unexpected server error occurred.", 500);
}
