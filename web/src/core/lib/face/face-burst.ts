import { z } from "zod";

/**
 * The shape of a burst of frames, shared by every route that takes one.
 *
 * One schema rather than three, so the limits cannot drift: the service
 * refuses more than sixteen frames, and a route that accepted twenty would
 * only discover that after the upload.
 */

/** Matches MAX_FRAMES in face/app/main.py. */
export const MAX_BURST_FRAMES = 16;

/**
 * A 640x480 JPEG at the quality the browser uses is ~30KB, ~40KB in base64.
 * Four times that is generous and still refuses a frame that is not what it
 * claims to be before it is forwarded anywhere.
 */
export const MAX_FRAME_CHARS = 160 * 1024;

export const burstSchema = z.object({
  frames: z
    .array(z.string().min(1).max(MAX_FRAME_CHARS))
    .min(1)
    .max(MAX_BURST_FRAMES),
  /** The camera's own dimensions, for the diagnostics line only. */
  videoWidth: z.number().int().nonnegative().optional(),
  videoHeight: z.number().int().nonnegative().optional(),
});

export type BurstPayload = z.infer<typeof burstSchema>;
