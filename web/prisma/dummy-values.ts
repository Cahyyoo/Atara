/**
 * Plausible values for demonstration data, shared by the dummy seed (new
 * samples) and the dummy fill (samples already there).
 *
 * A seeded generator, so a re-run gives comparable data. Nothing here touches
 * the database.
 */

export function createRandom(seed: number) {
  let state = seed;
  function random(): number {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  }
  function int(min: number, max: number): number {
    return min + Math.floor(random() * (max - min + 1));
  }
  function decimal(min: number, max: number, places = 3): number {
    return Number((min + random() * (max - min)).toFixed(places));
  }
  function pick<T>(items: readonly T[]): T {
    return items[Math.floor(random() * items.length)];
  }
  return { random, int, decimal, pick };
}

export type Random = ReturnType<typeof createRandom>;

/** Typical nickel laterite assays. */
export function dummyResults(rng: Random) {
  return {
    ni: rng.decimal(0.8, 2.4),
    fe: rng.decimal(10, 46),
    co: rng.decimal(0.02, 0.15),
    sio2: rng.decimal(15, 47),
    mgo: rng.decimal(2, 24),
    cao: rng.decimal(0.1, 1.8),
    al2o3: rng.decimal(1, 11),
    cr: rng.decimal(0.5, 2.5),
    fe2o3: rng.decimal(15, 60),
    cr2o3: rng.decimal(0.5, 3),
    mno: rng.decimal(0.1, 1.5),
    na2o: rng.decimal(0.01, 0.2),
    p2o5: rng.decimal(0.001, 0.05),
    tio2: rng.decimal(0.02, 0.4),
    s: rng.decimal(0.01, 0.15),
    co2: rng.decimal(1, 20),
    zn: rng.decimal(0.01, 0.1),
    sum: 100,
  };
}

/** What the XRF reports with its numbers, and the instrument it ran on. */
export function dummyInstrument(rng: Random, finishedAt: Date) {
  return {
    measurementMethod: "STARGATE_LG-GEO",
    solutionId: rng.pick(["866", "883"]),
    measurementFinished: finishedAt,
    xrayInstrument: "S2 PUMA",
  };
}

/**
 * A moisture-content weighing, grams: the pan, pan with the wet sample, pan
 * with the dried one -- chosen so MC lands where laterite does, 28-42%.
 */
export function dummyWeights(rng: Random) {
  const wp = rng.decimal(560, 590, 1);
  const w0 = rng.decimal(2700, 3200, 1);
  const mc = rng.decimal(28, 42, 2);
  const wd = Number((w0 - (mc * (w0 - wp)) / 100).toFixed(1));
  return { wp, w0, wd };
}

export const DUMMY_REMARKS = [
  "Re-assay requested by production.",
  "Sample slightly wet on arrival.",
  "Duplicate check within tolerance.",
  null,
  null,
  null,
] as const;
