"use client";

import { GUIDE } from "@/lib/face-quality";

/**
 * The oval showing where a face should sit.
 *
 * Its size comes from GUIDE, which is derived from the very thresholds the
 * checker enforces. That is the point of it: a guide drawn from its own
 * numbers would eventually tell somebody to stand where the checker refuses
 * them, and an app that marks the spot and then rejects it reads as broken
 * rather than as a person standing wrong.
 *
 * SVG over the video, and nothing else: no library, no measurement of the DOM,
 * no work on any frame. The fractions are the same in any camera resolution,
 * which is why the checker measures relative boxes rather than pixels.
 */
export function FaceGuide({ isGood }: { isGood: boolean }) {
  // Percentages of the preview, straight from the fractions the checker uses.
  const rx = (GUIDE.width / 2) * 100;
  const ry = (GUIDE.height / 2) * 100;

  return (
    <svg
      // Decorative: the same information is in the hint text and in the
      // refusal, both of which a screen reader gets.
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {/* Everything outside the oval is dimmed, so the oval reads as the place
          to be rather than as a decoration floating over the picture. */}
      <mask id="face-guide-cutout">
        <rect width="100" height="100" fill="white" />
        <ellipse cx="50" cy="50" rx={rx} ry={ry} fill="black" />
      </mask>
      <rect width="100" height="100" fill="black" opacity="0.35" mask="url(#face-guide-cutout)" />

      {/* Green once the current frame passes every check: the strongest guide
          available, because it needs no reading at all. */}
      <ellipse
        cx="50"
        cy="50"
        rx={rx}
        ry={ry}
        fill="none"
        vectorEffect="non-scaling-stroke"
        strokeWidth={isGood ? 3 : 2}
        strokeDasharray={isGood ? undefined : "4 3"}
        className={
          isGood
            ? "stroke-primary transition-all duration-200"
            : "stroke-white/70 transition-all duration-200"
        }
      />
    </svg>
  );
}
