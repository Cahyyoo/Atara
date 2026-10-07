/**
 * A counting semaphore with a bounded queue, and the bound is the point.
 *
 * The face service runs a fixed number of workers, each of which handles one
 * burst at a time. Sending it more than that does not make it faster; it
 * makes every burst wait in the kernel's backlog, where nothing can time it
 * out, until the web's own timeout fires -- and the worker then computes an
 * answer nobody is waiting for. A queue with a ceiling turns that into an
 * immediate refusal the client can act on: "busy, try in a moment" arrives in
 * milliseconds instead of a timeout arriving after five seconds of wasted
 * work on both sides.
 */

export class QueueFullError extends Error {
  constructor() {
    super("queue-full");
    this.name = "QueueFullError";
  }
}

export class Semaphore {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    /** How many may run at once. */
    private readonly slots: number,
    /** How many may wait for a slot; beyond this, acquire refuses at once. */
    private readonly maxQueue: number
  ) {
    if (slots < 1) throw new RangeError("A semaphore needs at least one slot.");
    if (maxQueue < 0) throw new RangeError("The queue bound cannot be negative.");
  }

  /**
   * Resolves with a release function once a slot is free. Rejects with
   * QueueFullError immediately -- not after waiting -- when the queue is full.
   */
  acquire(): Promise<() => void> {
    if (this.running < this.slots) {
      this.running += 1;
      return Promise.resolve(this.releaser());
    }
    if (this.waiting.length >= this.maxQueue) {
      return Promise.reject(new QueueFullError());
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.running += 1;
        resolve(this.releaser());
      });
    });
  }

  /** What is going on right now, for the health endpoint. */
  status(): { running: number; queued: number; slots: number } {
    return { running: this.running, queued: this.waiting.length, slots: this.slots };
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      // Releasing twice must not hand out a phantom slot.
      if (released) return;
      released = true;
      this.running -= 1;
      const next = this.waiting.shift();
      if (next) next();
    };
  }
}
