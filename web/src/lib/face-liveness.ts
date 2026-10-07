/**
 * Was there a living face in front of the camera, or a photograph of one?
 *
 * A blink is the cheapest question that a still image cannot answer. It is
 * measured from the eye landmarks the recogniser already produces, so it costs
 * nothing extra to ask.
 *
 * Be clear about what this is worth. It stops a colleague holding a printed
 * photo up to the webcam. It runs on the server, on landmarks dlib measured,
 * so it cannot simply be deleted from the browser -- but the frames still come
 * from a browser the attacker controls, and a recording of somebody blinking
 * passes it. The honest summary is that it raises the effort, not that it
 * closes the door -- and the password in front of it is what is actually
 * load-bearing.
 */

export interface Point {
  x: number;
  y: number;
}

/** Open eyes sit near 0.3, a closed one near 0.1. */
export const BLINK_THRESHOLD = 0.21;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Eye aspect ratio: how tall an eye is relative to how wide.
 *
 * Takes the six landmarks dlib's 68-point model gives per eye, corner to
 * corner. Height is
 * averaged over the two vertical pairs so a single mis-placed landmark cannot
 * decide it on its own.
 */
export function eyeAspectRatio(eye: Point[]): number {
  if (eye.length !== 6) {
    throw new Error(`An eye has 6 landmarks, got ${eye.length}.`);
  }

  const width = distance(eye[0], eye[3]);
  // A zero width means the landmarks collapsed; reporting 0 reads as "closed",
  // which refuses rather than admits.
  if (width === 0) return 0;

  const height = (distance(eye[1], eye[5]) + distance(eye[2], eye[4])) / 2;
  return height / width;
}

export function eyesAreClosed(left: Point[], right: Point[]): boolean {
  // Both eyes, not the average of the two. Averaging looks reasonable and is
  // wrong here: an eye the detector loses reads as 0, and 0 averaged against
  // a wide-open 0.34 still lands under the threshold -- so a reflection off
  // safety glasses would count as a blink and hand the liveness check away.
  // Taking the more open of the two means only a real blink closes both.
  return Math.max(eyeAspectRatio(left), eyeAspectRatio(right)) < BLINK_THRESHOLD;
}

/**
 * A blink is a closing followed by an opening.
 *
 * Fed the ratio of each frame in order. Requiring the opening as well is what
 * separates a blink from a face that simply arrived with its eyes shut -- and
 * from a photograph of someone mid-blink.
 */
export function sawBlink(frames: boolean[]): boolean {
  const firstClosed = frames.indexOf(true);
  if (firstClosed === -1) return false;
  return frames.slice(firstClosed).includes(false);
}
