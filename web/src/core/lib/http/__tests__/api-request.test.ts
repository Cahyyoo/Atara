import { describe, expect, it } from "vitest";

import { readJsonBody } from "@/core/lib/http/api-request";
import { ApiError, handleApiError } from "@/core/lib/http/api-response";

/** A real Request, so what is under test is the actual parser. */
function post(body: string | undefined): Request {
  return new Request("http://localhost/api/anything", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

async function statusOf(body: string | undefined): Promise<number> {
  try {
    await readJsonBody(post(body));
    return 200;
  } catch (error) {
    return error instanceof ApiError ? error.status : -1;
  }
}

describe("readJsonBody", () => {
  it("returns what was sent when the body parses", async () => {
    await expect(readJsonBody(post('{"ni":1.86}'))).resolves.toEqual({ ni: 1.86 });
  });

  it("passes through a body that is valid JSON but the wrong shape", async () => {
    // Not this function's business. The schema refuses it afterwards, and a
    // ZodError is a 422 — a different failure deserving a different answer.
    await expect(readJsonBody(post("[]"))).resolves.toEqual([]);
  });

  it("blames the caller for a body that will not parse", async () => {
    expect(await statusOf("{oops")).toBe(400);
    expect(await statusOf("not json at all")).toBe(400);
  });

  it("treats an empty body the same way", async () => {
    // Absent is not a reason to report a server fault.
    expect(await statusOf("")).toBe(400);
    expect(await statusOf(undefined)).toBe(400);
  });

  it("throws something the API layer already knows how to answer", async () => {
    const error = await readJsonBody(post("{oops")).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(handleApiError(error).status).toBe(400);
  });
});

/**
 * The reason this helper exists rather than a SyntaxError branch in
 * handleApiError.
 *
 * That branch would be shorter and would have fixed the same symptom, so it is
 * exactly the change somebody adds later in good faith. It must not pass: the
 * shared handler catches everything thrown inside a route, and a SyntaxError
 * from a stored JSON column or a plain bug would then be reported as the
 * caller's fault and vanish from the logs.
 */
describe("handleApiError leaves a loose SyntaxError alone", () => {
  it("still answers 500 for a SyntaxError it did not raise itself", () => {
    expect(handleApiError(new SyntaxError("Unexpected token }")).status).toBe(500);
  });

  it("and says nothing about it to the client", async () => {
    const response = handleApiError(new SyntaxError("secret parser detail"));
    const body = await response.json();

    expect(body.error).toBe("An unexpected server error occurred.");
    expect(JSON.stringify(body)).not.toContain("secret parser detail");
  });
});
