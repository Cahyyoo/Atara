import { describe, expect, it } from "vitest";
import {
  BLANK_LUMINANCE,
  isFrameBlank,
  meanLuminance,
  pixelLuminance,
} from "@/lib/face-frame";

/** An RGBA buffer where every pixel is the same grey. */
function flatFrame(level: number, pixels = 64): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < bytes.length; index += 4) {
    bytes[index] = level;
    bytes[index + 1] = level;
    bytes[index + 2] = level;
    bytes[index + 3] = 255;
  }
  return bytes;
}

describe("pixelLuminance", () => {
  it("weights green most and blue least, as the eye does", () => {
    expect(pixelLuminance(0, 255, 0)).toBeGreaterThan(pixelLuminance(255, 0, 0));
    expect(pixelLuminance(255, 0, 0)).toBeGreaterThan(pixelLuminance(0, 0, 255));
  });

  it("reads black as 0 and white as 255", () => {
    expect(pixelLuminance(0, 0, 0)).toBe(0);
    expect(pixelLuminance(255, 255, 255)).toBeCloseTo(255, 5);
  });
});

describe("meanLuminance", () => {
  it("averages a flat frame to its own level", () => {
    expect(meanLuminance(flatFrame(40))).toBeCloseTo(40, 5);
  });

  it("treats an empty buffer as dark rather than dividing by zero", () => {
    // A camera that produced nothing at all is the case this exists for.
    expect(meanLuminance(new Uint8ClampedArray(0))).toBe(0);
  });

  it("refuses a buffer that is not RGBA", () => {
    expect(() => meanLuminance(new Uint8ClampedArray(7))).toThrow(/RGBA/);
  });
});

describe("isFrameBlank", () => {
  it("calls a shuttered lens blank", () => {
    expect(isFrameBlank(flatFrame(0))).toBe(true);
    expect(isFrameBlank(flatFrame(2))).toBe(true);
  });

  /**
   * The false positive that would matter. A lab bench at night, or a face lit
   * only by the screen, is still a picture — and calling it "no picture" would
   * send somebody looking for a closed shutter that is not there.
   */
  it("does not call a dim room blank", () => {
    expect(isFrameBlank(flatFrame(20))).toBe(false);
    expect(isFrameBlank(flatFrame(BLANK_LUMINANCE + 1))).toBe(false);
  });

  it("is not rescued by one bright pixel", () => {
    // A stuck sensor cell, or a status light reflected in the shutter. Any
    // check asking whether *anything* is lit would pass this frame.
    const frame = flatFrame(0, 1024);
    frame[0] = 255;
    frame[1] = 255;
    frame[2] = 255;

    expect(isFrameBlank(frame)).toBe(true);
  });

  it("is decided at the threshold", () => {
    expect(isFrameBlank(flatFrame(BLANK_LUMINANCE - 1))).toBe(true);
    expect(isFrameBlank(flatFrame(BLANK_LUMINANCE))).toBe(false);
  });
});
