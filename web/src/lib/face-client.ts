"use client";

import { isFrameBlank } from "@/lib/face-frame";
import type { CaptureDiagnostics } from "@/lib/face-diagnostics";

/**
 * The browser half, now that dlib does the looking.
 *
 * This file used to be 400 lines and pull in 6.7MB of weights. Everything that
 * judged a face has moved to the server, where it cannot be edited by the
 * machine being judged; what is left is the part only a browser can do --
 * opening a camera and getting pictures out of it.
 *
 * Nothing here decides anything.
 */

/**
 * Twelve frames, 120ms apart.
 *
 * The spacing is the constraint, not the count. A blink lasts roughly 100 to
 * 150ms, so a sample every 120ms is about the widest gap that still lands
 * inside one; the old 24-frames-at-80ms was more generous and cost twice the
 * upload for a burst that is measured in one request now rather than
 * twenty-four passes. Twelve at 120ms spans 1.4 seconds, which is long enough
 * to ask somebody to blink and short enough that they will.
 *
 * Going wider is the first thing to try if blinks start being missed, and it
 * costs bandwidth rather than accuracy.
 */
export const BURST_FRAMES = 12;
export const BURST_INTERVAL_MS = 120;

/**
 * JPEG quality for a frame nobody will ever look at.
 *
 * 0.75 at 640x480 is about 30KB, so a burst is roughly 400KB uploaded. The
 * service resizes anything wider than 640 anyway, and dlib aligns the face to
 * a 150x150 chip before describing it, so detail beyond this is spent on
 * pixels the recogniser throws away.
 */
const FRAME_QUALITY = 0.75;

/**
 * Width of a preview frame. The guide only asks where the face is, and the
 * detector answers that on 320 pixels in 11ms where 640 takes 41ms (measured,
 * face/README.md). Four times cheaper for the service and four times less to
 * upload, twice a second, from every tablet in the room. The face must still
 * be a quarter of the frame wide to pass, which at 320px is the 80px window
 * the detector was trained on -- a marginal face reads "too far" one step
 * earlier than before, which is the conservative direction. Bursts stay at
 * full size: the descriptor is cut from a 150px chip and needs the pixels.
 */
export const PREVIEW_WIDTH = 320;

export interface Burst {
  /** Base64 JPEG, no data-URL prefix. */
  frames: string[];
  videoWidth: number;
  videoHeight: number;
  /** True when the camera was running and sending nothing at all. */
  blank: boolean;
}

/** One scratch canvas for the whole burst rather than one per frame. */
let scratch: HTMLCanvasElement | null = null;

function scratchContext(width: number, height: number): CanvasRenderingContext2D | null {
  scratch ??= document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  return scratch.getContext("2d", { willReadFrequently: true });
}

function grab(video: HTMLVideoElement, quality = FRAME_QUALITY): string | null {
  const context = scratchContext(video.videoWidth, video.videoHeight);
  if (!context) return null;

  context.drawImage(video, 0, 0);
  // Everything after the comma; the service takes raw base64.
  return scratch!.toDataURL("image/jpeg", quality).split(",")[1] ?? null;
}

/**
 * Is the camera actually producing a picture?
 *
 * Kept in the browser even though everything else moved, because it needs no
 * model and answering it here saves uploading a burst of black frames to be
 * told they were black. A 32x24 grab is plenty to ask whether any light is
 * reaching the sensor.
 */
export function isCameraBlank(video: HTMLVideoElement): boolean {
  if (video.videoWidth === 0 || video.videoHeight === 0) return true;

  const context = scratchContext(32, 24);
  // No context is not evidence either way, so it is not called blank.
  if (!context) return false;

  context.drawImage(video, 0, 0, 32, 24);
  return isFrameBlank(context.getImageData(0, 0, 32, 24).data);
}

/** One small frame, for the live guide. Cheap enough to ask for repeatedly. */
export function grabPreviewFrame(video: HTMLVideoElement): string | null {
  if (video.videoWidth === 0) return null;
  const height = Math.max(1, Math.round((PREVIEW_WIDTH * video.videoHeight) / video.videoWidth));
  const context = scratchContext(PREVIEW_WIDTH, height);
  if (!context) return null;

  context.drawImage(video, 0, 0, PREVIEW_WIDTH, height);
  return scratch!.toDataURL("image/jpeg", 0.6).split(",")[1] ?? null;
}

/**
 * A run of frames from the camera.
 *
 * The blank check runs first: a covered lens produces a burst that is
 * perfectly valid, perfectly black, and a waste of 400KB to have refused
 * somewhere else.
 */
export async function captureBurst(
  video: HTMLVideoElement,
  onProgress?: (done: number, total: number) => void
): Promise<Burst> {
  const dimensions = { videoWidth: video.videoWidth, videoHeight: video.videoHeight };

  if (isCameraBlank(video)) {
    return { frames: [], ...dimensions, blank: true };
  }

  const frames: string[] = [];
  for (let index = 0; index < BURST_FRAMES; index += 1) {
    const started = Date.now();

    const frame = grab(video);
    if (frame) frames.push(frame);
    onProgress?.(index + 1, BURST_FRAMES);

    // Sleep only the remainder, so a slow machine does not stretch the burst
    // past the window somebody was asked to blink in.
    const remaining = BURST_INTERVAL_MS - (Date.now() - started);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  return { frames, ...dimensions, blank: false };
}

/**
 * What a refused burst means, read off the route's answer.
 *
 * Both callers -- signing in and enrolling -- get the same shapes back from
 * their routes, and both used to unpack them by hand. One reader, so a new
 * failure code has one place to be understood.
 */
export interface Refusal {
  /** A key in the `face` namespace. */
  messageKey: string;
  /** The measurements, when the route sent them; null for a service outage. */
  diagnostics: CaptureDiagnostics | null;
  /**
   * Whether the camera may simply try this one again.
   *
   * The distinction that matters is whether an attempt costs anything. Being
   * too far from the lens, or not blinking in time, costs nothing: the server
   * refuses before it compares anything, so the camera can count down and go
   * again. A face that was compared and did not match costs one of five
   * attempts before the account locks for fifteen minutes -- and the camera
   * fires on a timer, so five of those arrive in about half a minute with
   * nobody pressing anything.
   *
   * So the ones with a price ask a person first.
   */
  canRetry: boolean;
}

/**
 * Every message key interpretRefusal can hand back that is not a
 * QualityReason. Reached through `t(refusal.messageKey)`, which no scan of
 * the source can see -- so the orphan test imports this rather than guessing.
 */
export const REFUSAL_KEYS = ["noFace", "notAlive", "serviceDown", "serviceBusy"] as const;

export function interpretRefusal(body: {
  code?: string;
  details?: { diagnostics?: CaptureDiagnostics; reason?: string };
  error?: string;
}): Refusal | null {
  const diagnostics = body.details?.diagnostics ?? null;
  switch (body.code) {
    // Refused before anything was compared, so nothing was spent. The camera
    // can count down and go again.
    case "no-face":
      return { messageKey: "noFace", diagnostics, canRetry: true };
    case "poor-quality":
      return {
        messageKey: body.details?.reason ?? "qualityUnsure",
        diagnostics,
        canRetry: true,
      };
    case "not-alive":
      return { messageKey: "notAlive", diagnostics, canRetry: true };

    // Every worker is taken. The request never reached the service, so a
    // retry costs it nothing, and the camera's own cooldown is the wait.
    case "service-busy":
      return { messageKey: "serviceBusy", diagnostics: null, canRetry: true };

    // Nothing here will change by trying again in four seconds, and one of
    // them is not free.
    case "service-down":
      return { messageKey: "serviceDown", diagnostics: null, canRetry: false };
    default:
      return null;
  }
}

export class InsecureContextError extends Error {
  constructor() {
    super("insecure-context");
    this.name = "InsecureContextError";
  }
}

/** Opens the camera, or throws whatever the browser threw at the caller. */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  /**
   * Checked before asking, because the symptom is identical to a refusal and
   * the cause is completely different.
   *
   * getUserMedia only exists in a secure context. localhost counts as one, so
   * this works on the machine it was built on and then stops the moment
   * anyone opens it over the lab network as http://192.168.x.x -- where
   * navigator.mediaDevices is simply undefined and the prompt never appears.
   * Without this the failure reads as "you refused", which sends people to
   * look in the wrong place.
   */
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new InsecureContextError();
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  await waitForFrames(video);
  return stream;
}

/**
 * Wait until the video actually has a picture.
 *
 * `play()` resolving does not mean a frame exists. A burst grabbed from a
 * video with no dimensions is a burst of nothing, which arrives at the service
 * as "no face found" -- a whole class of failure that costs one await to rule
 * out.
 *
 * Bounded, because a camera that never produces a frame must not leave the
 * button spinning forever.
 */
async function waitForFrames(video: HTMLVideoElement, timeoutMs = 3000): Promise<void> {
  if (video.videoWidth > 0) return;

  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    video.addEventListener("loadeddata", done, { once: true });
  });
}

/** Cameras stay on until told otherwise, and a light left on is alarming. */
export function closeCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
