import { ApiError } from "@/lib/api-response";

/**
 * Reads a JSON request body, refusing a malformed one as the caller's mistake
 * -- and refusing an oversized one before it is read at all.
 *
 * `Request.json()` throws a SyntaxError when the body will not parse, and
 * `handleApiError` has no branch for that, so it used to land on the
 * catch-all: logged as unexpected and answered 500. Nothing about it is
 * unexpected — the caller sent something that is not JSON, and 500 tells them
 * to retry later for a request that can never succeed until they change it.
 *
 * Handled here rather than in `handleApiError`, and that placement is the
 * whole point. A SyntaxError branch in the shared handler would catch every
 * SyntaxError thrown anywhere inside a route — parsing a stored JSON column, a
 * bad regular expression, a genuine bug — and report each one as "400, your
 * fault". Server faults would disappear from the logs disguised as client
 * errors. Only the parse itself knows that the caller is the one at fault, so
 * only the parse says so.
 *
 * A body that is valid JSON but the wrong shape is a different failure and
 * keeps its own answer: the schema rejects it, and `ZodError` becomes a 422.
 *
 * The size limit exists because nothing else provides one. The API routes sit
 * outside the middleware matcher, so Next's own 10 MB proxy limit never
 * applies to them, and three of them -- login, the face burst, the preview --
 * parse their body before they check who is asking. A single Node process
 * holds every request's body in memory several times over while it parses;
 * two hundred unauthenticated posts at a few megabytes each was enough to
 * end it. Checked twice: a Content-Length over the limit is refused without
 * touching the body, and a body that lies about its length is cut off the
 * moment it passes the limit.
 */

/** Bytes. Named per route so the number sits next to the reason for it. */
export const BODY_LIMIT = {
  /** Every ordinary JSON body: a form, a filter, a handful of ids. */
  default: 64 * 1024,
  login: 4 * 1024,
  scan: 8 * 1024,
  /** One 320px preview frame as base64, with room for the envelope. */
  preview: 256 * 1024,
  /** Sixteen frames at MAX_FRAME_CHARS each, base64, plus the envelope. */
  burst: 3 * 1024 * 1024,
  /** Two hundred records with every assay column. */
  bulk: 512 * 1024,
  /** The CSV importer's own 2,000,000-character cap, JSON-escaped. */
  csvImport: 2560 * 1024,
} as const;

export async function readJsonBody(
  request: Request,
  maxBytes: number = BODY_LIMIT.default
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw tooLarge(maxBytes);
  }

  const text = await readUpTo(request, maxBytes);

  try {
    return JSON.parse(text);
  } catch {
    // Covers an empty body too: absent is not a reason to blame the server.
    throw new ApiError("The request body must be valid JSON.", 400);
  }
}

function tooLarge(maxBytes: number): ApiError {
  return new ApiError(
    `The request body is larger than ${Math.round(maxBytes / 1024)}KB.`,
    413,
    "PAYLOAD_TOO_LARGE"
  );
}

/**
 * The body as text, or a 413 the moment it grows past the limit.
 *
 * Read chunk by chunk rather than with `request.text()`, so a body whose
 * Content-Length was absent or false is still stopped at the limit rather
 * than buffered whole and measured afterwards.
 */
async function readUpTo(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    // Whether it finished or was cut off, nothing more will be read.
    reader.releaseLock();
  }

  const joined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
