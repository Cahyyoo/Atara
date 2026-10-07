import { describe, expect, it } from "vitest";
import {
  DESCRIPTOR_LENGTH,
  MATCH_THRESHOLD,
  bytesToDescriptor,
  descriptorToBytes,
  euclideanDistance,
  isDescriptorPayload,
  matchDescriptor,
} from "@/lib/face-match";

/** A descriptor whose every entry is the same, for arithmetic with known answers. */
function flat(value: number): Float32Array {
  return new Float32Array(DESCRIPTOR_LENGTH).fill(value);
}

/** Moves one descriptor a known euclidean distance from another. */
function shifted(from: Float32Array, distance: number): Float32Array {
  const moved = Float32Array.from(from);
  moved[0] += distance;
  return moved;
}

describe("euclideanDistance", () => {
  it("is zero for a descriptor against itself", () => {
    expect(euclideanDistance(flat(0.1), flat(0.1))).toBe(0);
  });

  it("measures a single-axis move as that move", () => {
    expect(euclideanDistance(flat(0), shifted(flat(0), 0.5))).toBeCloseTo(0.5, 5);
  });

  it("adds across axes the way a distance should", () => {
    const a = new Float32Array(DESCRIPTOR_LENGTH);
    const b = new Float32Array(DESCRIPTOR_LENGTH);
    b[0] = 3;
    b[1] = 4;

    expect(euclideanDistance(a, b)).toBeCloseTo(5, 5);
  });

  it("refuses to compare descriptors of different lengths", () => {
    // Silently comparing a short one would produce a small distance, which
    // reads as a match. Better to fail loudly than to let anybody in.
    expect(() => euclideanDistance(new Float32Array(128), new Float32Array(64))).toThrow(
      /differ in length/
    );
  });
});

describe("matchDescriptor", () => {
  const enrolled = [flat(0.1), flat(0.4)];

  it("lets a face through when it is close to any enrolled one", () => {
    const result = matchDescriptor(shifted(flat(0.4), 0.2), enrolled);

    expect(result.matched).toBe(true);
    expect(result.distance).toBeCloseTo(0.2, 5);
  });

  it("reports the closest enrolment, not the first", () => {
    // Enrolling five frames is pointless if only one is ever consulted.
    const result = matchDescriptor(shifted(flat(0.4), 0.05), enrolled);

    expect(result.distance).toBeCloseTo(0.05, 5);
  });

  it("keeps a different face out", () => {
    const stranger = shifted(flat(0.1), 1.5);

    expect(matchDescriptor(stranger, enrolled).matched).toBe(false);
  });

  it("is decided at the threshold, not near it", () => {
    const just_inside = shifted(flat(0.1), MATCH_THRESHOLD - 0.001);
    const just_outside = shifted(flat(0.1), MATCH_THRESHOLD + 0.001);

    expect(matchDescriptor(just_inside, enrolled).matched).toBe(true);
    expect(matchDescriptor(just_outside, enrolled).matched).toBe(false);
  });

  /**
   * The branch that would quietly undo the whole factor. An account whose
   * enrolments were deleted must fail the face step, not skip it — otherwise
   * getting an enrolment removed becomes the way past it.
   */
  it("refuses an account with nothing enrolled", () => {
    const result = matchDescriptor(flat(0.1), []);

    expect(result.matched).toBe(false);
    expect(result.distance).toBeNull();
  });
});

describe("what arrives over the wire", () => {
  it("accepts a well-formed descriptor", () => {
    expect(isDescriptorPayload(Array.from(flat(0.1)))).toBe(true);
  });

  it("refuses anything that is not 128 finite numbers", () => {
    const valid = Array.from(flat(0.1));

    expect(isDescriptorPayload(valid.slice(0, 127))).toBe(false);
    expect(isDescriptorPayload([...valid, 0.1])).toBe(false);
    expect(isDescriptorPayload(valid.map(String))).toBe(false);
    expect(isDescriptorPayload(null)).toBe(false);
    expect(isDescriptorPayload({ length: 128 })).toBe(false);
  });

  it("refuses NaN and Infinity", () => {
    // NaN survives every comparison as false, so a descriptor full of it
    // would produce a NaN distance — and `NaN <= threshold` is false, which
    // happens to be safe. Refused at the door anyway rather than relied on.
    const withNaN = Array.from(flat(0.1));
    withNaN[5] = Number.NaN;
    expect(isDescriptorPayload(withNaN)).toBe(false);

    const withInfinity = Array.from(flat(0.1));
    withInfinity[5] = Number.POSITIVE_INFINITY;
    expect(isDescriptorPayload(withInfinity)).toBe(false);
  });
});

describe("storage", () => {
  it("survives the round trip to bytes and back exactly", () => {
    const original = Float32Array.from({ length: DESCRIPTOR_LENGTH }, (_, index) =>
      Math.sin(index) * 0.5
    );

    const restored = bytesToDescriptor(descriptorToBytes(original));

    expect(Array.from(restored)).toEqual(Array.from(original));
    expect(euclideanDistance(original, restored)).toBe(0);
  });

  it("stores 512 bytes, not JSON", () => {
    expect(descriptorToBytes(flat(0.1)).byteLength).toBe(DESCRIPTOR_LENGTH * 4);
  });

  it("reads back correctly from a buffer sitting at an offset", () => {
    // The database driver hands back Buffers that often point into a shared
    // pool at an unaligned offset; viewing one directly as Float32Array
    // throws. This is the case that only shows up against a real database.
    const pool = Buffer.alloc(DESCRIPTOR_LENGTH * 4 + 3);
    const original = flat(0.25);
    pool.set(descriptorToBytes(original), 3);
    const offsetView = pool.subarray(3);

    expect(Array.from(bytesToDescriptor(offsetView))).toEqual(Array.from(original));
  });

  it("refuses a stored value of the wrong size", () => {
    expect(() => bytesToDescriptor(new Uint8Array(256))).toThrow(/expected 512/);
  });
});
