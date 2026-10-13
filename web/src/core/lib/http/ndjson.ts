/**
 * A long job answered as it goes: one JSON object per line (NDJSON), so the
 * browser can show progress instead of a spinner. `work` sends lines with
 * `send`; whatever it throws becomes a last `{ phase: "error" }` line, and
 * `onFinally` runs however the stream ends (to release a HeavyGate).
 */
export function ndjsonResponse(
  work: (send: (line: object) => void) => Promise<void>,
  options: { errorMessage: string; onFinally?: () => void; logLabel?: string }
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        await work(send);
      } catch (error) {
        console.error(`[${options.logLabel ?? "ndjson"}]`, error);
        send({ phase: "error", message: options.errorMessage });
      } finally {
        options.onFinally?.();
        controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
