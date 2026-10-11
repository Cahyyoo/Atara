import { describe, expect, it } from "vitest";
import { HeavyGate } from "@/lib/heavy-gate";
import { ApiError } from "@/lib/api-response";

/** A response whose body the test feeds by hand, so "still streaming" is real. */
function streamingResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return { response: new Response(body), controller };
}

describe("HeavyGate", () => {
  it("turns the request past the limit away as busy", async () => {
    const gate = new HeavyGate("export", 2);
    const a = streamingResponse();
    const b = streamingResponse();
    await gate.run(async () => a.response);
    await gate.run(async () => b.response);

    await expect(gate.run(async () => new Response("x"))).rejects.toMatchObject({ status: 429, code: "BUSY" });
    await expect(gate.run(async () => new Response("x"))).rejects.toBeInstanceOf(ApiError);
  });

  it("keeps the slot until a streamed body has been sent", async () => {
    const gate = new HeavyGate("export", 1);
    const { response, controller } = streamingResponse();
    const out = await gate.run(async () => response);
    expect(gate.inUse).toBe(1);

    const reader = out.body!.getReader();
    controller.enqueue(new Uint8Array([1, 2, 3]));
    expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
    expect(gate.inUse).toBe(1);

    controller.close();
    expect((await reader.read()).done).toBe(true);
    expect(gate.inUse).toBe(0);
  });

  it("frees the slot when the client goes away mid-download", async () => {
    const gate = new HeavyGate("export", 1);
    const { response } = streamingResponse();
    const out = await gate.run(async () => response);
    await out.body!.cancel();
    expect(gate.inUse).toBe(0);
  });

  it("frees the slot when the work itself fails", async () => {
    const gate = new HeavyGate("export", 1);
    await expect(gate.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(gate.inUse).toBe(0);
    // And an error answer with a small body is released once it is read.
    const out = await gate.run(async () => new Response("{}", { status: 413 }));
    expect(out.status).toBe(413);
    await out.text();
    expect(gate.inUse).toBe(0);
  });
});
