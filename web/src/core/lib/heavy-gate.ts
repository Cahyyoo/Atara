import "server-only";
import { ApiError } from "@/core/lib/http/api-response";

/**
 * A cap on how many of one heavy job run at once in this process.
 *
 * The Sample Database export has to hold every row it writes (the form groups
 * and averages batches), so one export near the 50,000-row limit took the
 * server past 1.3 GB and minutes of CPU, and nothing stopped five people from
 * starting one each. Past the cap the request is turned away at once with a
 * "busy, retry shortly" answer instead of joining a pile-up that slows every
 * scan and page in the process -- or ends it.
 */
export class HeavyGate {
  private running = 0;

  constructor(
    private readonly name: string,
    private readonly limit: number
  ) {}

  /** Takes a slot or refuses. The caller must call the returned release once. */
  acquire(): () => void {
    if (this.running >= this.limit) {
      throw new ApiError(
        `Another ${this.name} is already being prepared. Please try again in a minute.`,
        429,
        "BUSY"
      );
    }
    this.running += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running -= 1;
    };
  }

  /**
   * Runs `work` in a slot. A streamed response keeps the slot until its body
   * has been sent (or the client has gone), since that is when the work ends.
   */
  async run(work: () => Promise<Response>): Promise<Response> {
    const release = this.acquire();
    let response: Response;
    try {
      response = await work();
    } catch (error) {
      release();
      throw error;
    }
    if (!response.body) {
      release();
      return response;
    }
    // Released when the body ends, fails, or the client goes away (cancel).
    const reader = response.body.getReader();
    const guarded = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            release();
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          release();
          controller.error(error);
        }
      },
      async cancel(reason) {
        release();
        await reader.cancel(reason);
      },
    });
    return new Response(guarded, { status: response.status, headers: response.headers });
  }

  get inUse(): number {
    return this.running;
  }
}

/**
 * Spreadsheet exports carrying the logo. The streaming writer cannot place an
 * image, so these are built whole in memory -- up to EXPORT_ROW_LIMIT rows --
 * and two at a time is as many as a process should hold.
 */
export const xlsxExportGate = new HeavyGate("spreadsheet export", 2);
