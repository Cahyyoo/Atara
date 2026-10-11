import { APP_VERSION } from "@/lib/version";

/**
 * The release, in small print under every page.
 *
 * There so that a report from the floor ("it does this on my screen") can be
 * tied to a build without anyone having to look it up.
 *
 * A hairline rule above it, the same one the rest of the app separates a
 * footing with: without it the line reads as the last row of whatever table
 * or card happens to end the page.
 */
export function VersionFooter() {
  return (
    <footer className="mt-8 border-t pt-4 text-center text-[11px] tracking-wide text-muted-foreground/80">
      Version {APP_VERSION}
    </footer>
  );
}
