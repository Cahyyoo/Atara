// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { id as messages } from "@/core/i18n/test-messages";
import { Breadcrumb } from "@/core/components/layout/breadcrumb";
import { moduleForPath } from "@/core/lib/app/modules";
import type { SessionPayload } from "@/core/lib/auth/auth";

const LAB_ADMIN: SessionPayload = {
  userId: "u1",
  name: "Admin Lab",
  email: "admin@atara.local",
  role: "ADMIN",
  department: "LAB",
  sessionId: "s1",
};

function renderAt(pathname: string) {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <Breadcrumb module={moduleForPath(pathname)!} user={LAB_ADMIN} pathname={pathname} />
    </NextIntlClientProvider>
  );
  return within(screen.getByRole("navigation", { name: messages.nav.breadcrumb }));
}

afterEach(cleanup);

describe("the breadcrumb", () => {
  it("names every app, the module and the page, the page as current", () => {
    const trail = renderAt("/lab/database");

    expect(trail.getByRole("link", { name: messages.nav.allApps }).getAttribute("href")).toBe("/home");
    expect(trail.getByRole("link", { name: messages.nav.groups.lab }).getAttribute("href")).toBe("/lab/dashboard");
    expect(trail.getByText(messages.nav.sampleDatabase).getAttribute("aria-current")).toBe("page");
  });

  it("ends at the module on a page with no menu entry", () => {
    const trail = renderAt("/lab/samples/NKL-1");

    expect(trail.getAllByRole("listitem")).toHaveLength(2);
    expect(trail.getByRole("link", { name: messages.nav.groups.lab })).toBeTruthy();
  });

  it("leads the lab admin into Settings where they may go", () => {
    const trail = renderAt("/users");
    expect(trail.getByRole("link", { name: messages.nav.groups.system }).getAttribute("href")).toBe("/users");
  });
});
