/**
 * Is the camera sending a picture at all?
 *
 * "No face detected" and "the camera is delivering black" read the same to a
 * person and have nothing in common: one is a lighting problem, the other is a
 * closed privacy shutter or another application holding the device. Telling
 * someone to check the lighting when the lens is covered sends them to fix the
 * wrong thing.
 *
 * Pure, so the rule can be tested against arrays of numbers instead of against
 * a webcam.
 */

/**
 * Mean brightness below which a frame counts as no picture at all.
 *
 * Deliberately very low. A dim room at night still lands well above this --
 * sensor noise alone does. Only a shuttered lens or a stopped track produces a
 * frame this flat, so a false positive here would have to be a camera pointed
 * into a closed box.
 */
export const BLANK_LUMINANCE = 6;

/** Rec. 601 luma: how bright a pixel looks, not how large its numbers are. */
export function pixelLuminance(red: number, green: number, blue: number): number {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

/**
 * @param pixels RGBA bytes, as getImageData returns them.
 */
export function meanLuminance(pixels: Uint8ClampedArray): number {
  if (pixels.length === 0) return 0;
  if (pixels.length % 4 !== 0) {
    throw new Error(`Expected RGBA bytes, got a length of ${pixels.length}.`);
  }

  let total = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    total += pixelLuminance(pixels[index], pixels[index + 1], pixels[index + 2]);
  }
  return total / (pixels.length / 4);
}

/**
 * The mean and not the maximum, on purpose.
 *
 * A single bright pixel -- a stuck sensor cell, a status LED reflected in a
 * closed shutter -- must not rescue an otherwise black frame, and it would
 * under any check that asks whether *anything* is lit.
 */
export function isFrameBlank(pixels: Uint8ClampedArray): boolean {
  return meanLuminance(pixels) < BLANK_LUMINANCE;
}
