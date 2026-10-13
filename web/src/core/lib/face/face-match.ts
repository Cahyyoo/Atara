/**
 * Comparing a face against the ones enrolled for an account.
 *
 * Kept pure and away from the route so it can be tested with numbers instead
 * of a camera: everything here is arithmetic on two arrays of 128 floats.
 *
 * What this is and is not, stated where the code is rather than only in a
 * plan: the descriptor is computed on the server, by the dlib service in
 * ../../face, from frames the browser sends -- so a caller can no longer post
 * a descriptor of their choosing. What they can still post is frames: an
 * attacker who already has the password can skip the camera and send
 * photographs of the account holder. The liveness checks (face-liveness.ts)
 * are what stand in the way of that, and they raise the cost rather than
 * close the door. The password in front of this is what is load-bearing.
 */

/** dlib's ResNet descriptors are 128 floats. */
export const DESCRIPTOR_LENGTH = 128;

/**
 * Euclidean distance below which two descriptors are taken to be the same
 * person. 0.6 is dlib's own documented threshold; lower is stricter.
 * Named rather than inlined because it is the one number that decides who
 * gets in, and it should never be edited without somebody noticing.
 */
export const MATCH_THRESHOLD = 0.6;

export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Descriptors differ in length: ${a.length} vs ${b.length}.`);
  }

  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const difference = a[index] - b[index];
    sum += difference * difference;
  }
  return Math.sqrt(sum);
}

export interface MatchResult {
  matched: boolean;
  /** The closest enrolled face, or null when there are none to compare. */
  distance: number | null;
}

/**
 * The closest enrolment, and whether it is close enough.
 *
 * An account with no enrolments never matches. That is deliberate: the face
 * step is only ever reached for accounts that have one, and a "no enrolments
 * so let them through" branch is exactly how a second factor turns into a
 * formality for anyone who can get their enrolment deleted.
 */
export function matchDescriptor(
  candidate: Float32Array,
  enrolled: Float32Array[]
): MatchResult {
  if (enrolled.length === 0) {
    return { matched: false, distance: null };
  }

  let closest = Infinity;
  for (const known of enrolled) {
    const distance = euclideanDistance(candidate, known);
    if (distance < closest) closest = distance;
  }

  return { matched: closest <= MATCH_THRESHOLD, distance: closest };
}

/** A descriptor as it travels: plain numbers over JSON. */
export function isDescriptorPayload(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === DESCRIPTOR_LENGTH &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

/**
 * Stored as the raw 512 bytes rather than as JSON: exact, and a quarter the size.
 *
 * A fresh Uint8Array rather than a Buffer view. A view would share memory with
 * whatever the descriptor was carved out of, and its ArrayBufferLike does not
 * narrow to the ArrayBuffer the database client asks for.
 *
 * The <ArrayBuffer> is load-bearing, not decoration: a bare Uint8Array now
 * means Uint8Array<ArrayBufferLike>, which could be backed by a
 * SharedArrayBuffer and which Prisma refuses.
 */
export function descriptorToBytes(descriptor: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(descriptor.byteLength);
  bytes.set(new Uint8Array(descriptor.buffer, descriptor.byteOffset, descriptor.byteLength));
  return bytes;
}

export function bytesToDescriptor(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength !== DESCRIPTOR_LENGTH * 4) {
    throw new Error(`Stored descriptor is ${bytes.byteLength} bytes, expected 512.`);
  }
  // Copied rather than viewed: a Buffer from the driver sits at an offset
  // inside a shared pool, and Float32Array needs a 4-byte aligned start.
  //
  // new Uint8Array(bytes) and not bytes.slice(): Buffer extends Uint8Array
  // but overrides slice() as an alias for subarray, so it returns another
  // view into the same pool rather than a copy. The .buffer behind it is then
  // the whole pool, and the read fails or -- worse -- succeeds on the wrong
  // bytes. This only shows up against a real driver, never against a test
  // fixture built with Buffer.from.
  return new Float32Array(new Uint8Array(bytes).buffer);
}
