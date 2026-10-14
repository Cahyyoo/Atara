/** One place and production code over the year so far. */
export interface YtdRow {
  /** The place code (MOL, LAM); null for samples with none yet. */
  place: string | null;
  /** The non-production code (TP, BG); null for production samples. */
  code: string | null;
  samples: number;
}

/** The wall monitor's year-to-date table. */
export interface YtdProduction {
  year: number;
  generatedAt: string;
  rows: YtdRow[];
}
