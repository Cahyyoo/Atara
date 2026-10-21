/**
 * Atara's mark: two peaks in one rounded stroke, with a lime sun beside the
 * higher one -- the mining ground the platform's modules work on.
 *
 * Drawn in `currentColor`, so the tile it sits on decides the stroke (white
 * on the brand gradient). The sun is always the lime the phone app is built
 * around: the one note the web and the Atara Lab app share, while each keeps
 * its own shape.
 *
 * The same drawing is the favicon (src/app/icon.svg); change both together.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="18 14.5 72 72"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path
        d="M24 72L42 42L54 58L66 38L84 72"
        stroke="currentColor"
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={78} cy={30} r={5} fill="#9BD246" />
    </svg>
  );
}
