// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { id as messages } from "@/core/i18n/test-messages";
import { Brand, ModuleMenu, ModuleTabs } from "@/core/components/layout/module-nav";
import { moduleForPath } from "@/core/lib/app/modules";
import type { SessionPayload } from "@/core/lib/auth/auth";

let pathname = "/lab/database";
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }));
// useLinkStatus needs a real router; the spinner is not what is tested here.
vi.mock("@/core/components/layout/nav-pending", () => ({ NavPending: () => null }));

const LAB_ADMIN: SessionPayload = {
  userId: "u1",
  name: "Admin Lab",
  email: "admin@atara.local",
  role: "ADMIN",
  department: "LAB",
  sessionId: "s1",
};

function renderAt(path: string, ui: (path: string) => React.ReactNode) {
  pathname = path;
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      {ui(path)}
    </NextIntlClientProvider>
  );
}

const tabsAt = (path: string) =>
  renderAt(path, (p) => <ModuleTabs module={moduleForPath(p)!} user={LAB_ADMIN} />);
const menuAt = (path: string) =>
  renderAt(path, (p) => <ModuleMenu module={moduleForPath(p)!} user={LAB_ADMIN} />);

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("the module's tabs in the top bar", () => {
  it("hold that module's pages only, the open one marked", () => {
    tabsAt("/lab/database");
    const nav = within(screen.getByRole("navigation", { name: messages.nav.menu }));

    expect(nav.getByRole("link", { name: messages.nav.sampleDatabase }).getAttribute("aria-current")).toBe("page");
    expect(nav.getByRole("link", { name: messages.nav.dashboard }).getAttribute("aria-current")).toBeNull();
    // Users lives in Settings, and the data source in another module altogether.
    expect(nav.queryByRole("link", { name: messages.nav.users })).toBeNull();
    expect(nav.queryByRole("link", { name: messages.nav.dataSource })).toBeNull();
  });

  it("show the lab admin only Users in Settings", () => {
    tabsAt("/users");
    const links = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([messages.nav.users]);
  });

  it("mark the most specific page, not its parent too", () => {
    tabsAt("/lab/samples/NKL-1");
    // A sample's own page is in no tab: none claims it.
    const links = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(links.filter((link) => link.getAttribute("aria-current") === "page")).toEqual([]);
  });
});

describe("the module's menu in the phone drawer", () => {
  it("lists the same pages, the open one marked", () => {
    menuAt("/lab/database");
    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: messages.nav.sampleDatabase }).getAttribute("aria-current")).toBe("page");
    expect(nav.queryByRole("link", { name: messages.nav.users })).toBeNull();
  });

  it("switches straight to another app, or back to all of them", async () => {
    menuAt("/lab/database");
    await userEvent.click(screen.getByRole("button", { name: messages.nav.switchApp }));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining(messages.nav.groups.lab),
      expect.stringContaining(messages.nav.groups.system),
      messages.nav.allApps,
    ]);
    expect(within(items[0]).getByLabelText(messages.nav.currentApp)).toBeTruthy();

    await userEvent.click(items[1]);
    expect(push).toHaveBeenCalledWith("/users");
  });
});

describe("the app's mark", () => {
  it("leads back to every app, named when it shows no name of its own", () => {
    renderAt("/lab/database", () => <Brand compact />);
    expect(screen.getByRole("link", { name: messages.nav.allApps }).getAttribute("href")).toBe("/home");
  });
});
