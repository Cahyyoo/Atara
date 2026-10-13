// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { VersionFooter } from "@/core/components/layout/version-footer";

/**
 * The release, under every page. Read from the build rather than typed in, so
 * the only thing worth pinning down is that it is printed and labelled.
 */

afterEach(cleanup);

describe("VersionFooter", () => {
  it("prints the build's version, named so it reads as one", () => {
    render(<VersionFooter />);
    // Nothing sets the variable in a test run, so it falls back to "dev".
    expect(screen.getByText(`Version ${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}`)).toBeTruthy();
  });

  it("is a footer landmark, so it is skippable", () => {
    const { container } = render(<VersionFooter />);
    expect(container.querySelector("footer")).toBeTruthy();
  });

  it("is set off from the content above by a rule", () => {
    const { container } = render(<VersionFooter />);
    // The separation is the point of the styling: without it the line reads
    // as the last row of whatever ends the page.
    expect(container.querySelector("footer")?.className).toContain("border-t");
  });
});
