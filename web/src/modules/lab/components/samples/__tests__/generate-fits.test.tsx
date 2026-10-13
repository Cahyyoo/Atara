// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { SampleIdentityFields, emptyIdentity } from "@/modules/lab/components/database/sample-identity-fields";

/**
 * The identity fields left the generate form -- barcodes are made first now,
 * and identified afterwards -- but the same nine fields still fill the edit
 * dialog and the bulk "fill in identity" dialog, at two very different widths.
 * Their layout rules are checked here, on the fields themselves.
 */

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <SampleIdentityFields values={emptyIdentity()} onChange={() => {}} options={[]} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe("the identity grid", () => {
  /** The grid holding the nine identity fields, found from a field upward. */
  function identityGrid(): HTMLElement {
    const field = document.querySelector('[id^="ident-"]');
    const grid = field?.closest<HTMLElement>('[class*="grid-cols-"]');
    if (!grid) throw new Error("no grid found around the identity fields");
    return grid;
  }

  it("still renders all nine fields", () => {
    show();
    expect(document.querySelectorAll('[id^="ident-"]')).toHaveLength(9);
  });

  it("goes to three columns on width", () => {
    show();
    expect(identityGrid().className).toContain("@3xl:grid-cols-3");
  });

  it("measures its own container, not the window", () => {
    show();
    // A viewport breakpoint would widen the copy inside a narrow dialog
    // column too; the container query cannot make that mistake.
    const field = document.querySelector('[id^="ident-"]');
    expect(field?.closest('[class*="@container"]')).not.toBeNull();
    expect(identityGrid().className).not.toMatch(/\b(sm|md|lg|xl|2xl):grid-cols-/);
  });
});

describe("overflow in the app shell", () => {
  it("clips sideways rather than hiding, so sticky bars inside pages still pin", () => {
    const shell = readFileSync(join(process.cwd(), "src", "core", "components", "layout", "app-shell.tsx"), "utf8");
    expect(shell).toContain("overflow-x-clip");
    expect(shell).not.toContain("overflow-x-hidden");
  });

  it("does not impose overflow-clip on every card in the app", () => {
    const card = readFileSync(join(process.cwd(), "src", "core", "components", "ui", "card.tsx"), "utf8");
    expect(card).toContain("overflow-hidden");
    expect(card).not.toContain("overflow-clip");
  });
});
