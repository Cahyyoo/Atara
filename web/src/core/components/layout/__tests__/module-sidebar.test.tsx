// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { id as messages } from "@/core/i18n/test-messages";
import { ModuleSidebar } from "@/core/components/layout/sidebar-nav";
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

function renderSidebar(path: string, options: { collapsed?: boolean; onToggle?: () => void } = {}) {
  pathname = path;
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <ModuleSidebar module={moduleForPath(path)!} user={LAB_ADMIN} {...options} />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("the sidebar inside a module", () => {
  it("holds that module's menu only, with the open page marked", () => {
    renderSidebar("/lab/database");
    const nav = within(screen.getByRole("navigation"));

    expect(nav.getByRole("link", { name: messages.nav.sampleDatabase }).getAttribute("aria-current")).toBe("page");
    expect(nav.getByRole("link", { name: messages.nav.dashboard }).getAttribute("aria-current")).toBeNull();
    // Users lives in Settings now, and drilling in another module altogether.
    expect(nav.queryByRole("link", { name: messages.nav.users })).toBeNull();
    expect(nav.queryByRole("link", { name: messages.nav.drilling })).toBeNull();
    expect(screen.getByText(messages.nav.groups.lab)).toBeTruthy();
  });

  it("switches straight to another app", async () => {
    renderSidebar("/lab/database");
    await userEvent.click(screen.getByRole("button", { name: messages.nav.switchApp }));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining(messages.nav.groups.lab),
      expect.stringContaining(messages.nav.groups.system),
      messages.nav.allApps,
    ]);
    // The open one is ticked.
    expect(within(items[0]).getByLabelText(messages.nav.currentApp)).toBeTruthy();

    await userEvent.click(items[1]);
    expect(push).toHaveBeenCalledWith("/users");
  });

  it("leads back to every app from the switcher", async () => {
    renderSidebar("/lab/database");
    await userEvent.click(screen.getByRole("button", { name: messages.nav.switchApp }));
    await userEvent.click(await screen.findByRole("menuitem", { name: messages.nav.allApps }));
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("shows the lab admin only Users in Settings", () => {
    renderSidebar("/users");
    const links = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([messages.nav.users]);
    expect(screen.getByText(messages.nav.groups.system)).toBeTruthy();
  });

  it("narrows to icons and keeps every name for screen readers and tooltips", async () => {
    const onToggle = vi.fn();
    renderSidebar("/lab/database", { collapsed: true, onToggle });

    const link = within(screen.getByRole("navigation")).getByRole("link", { name: messages.nav.sampleDatabase });
    expect(link.getAttribute("title")).toBe(messages.nav.sampleDatabase);
    expect(within(link).getByText(messages.nav.sampleDatabase).className).toContain("sr-only");
    // The module's name moves out of sight, onto the switcher's tooltip.
    expect(screen.queryByText(messages.nav.groups.lab)).toBeNull();

    const toggle = screen.getByRole("button", { name: messages.nav.expandMenu });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("narrows and widens on Ctrl+B or Cmd+B", () => {
    const onToggle = vi.fn();
    renderSidebar("/lab/database", { onToggle });

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    fireEvent.keyDown(window, { key: "B", metaKey: true });
    expect(onToggle).toHaveBeenCalledTimes(2);
    // A plain b, or one with Shift, is somebody typing.
    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, shiftKey: true });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("leaves Ctrl+B to a text box being typed in", () => {
    const onToggle = vi.fn();
    renderSidebar("/lab/database", { onToggle });
    const field = document.createElement("input");
    document.body.appendChild(field);

    fireEvent.keyDown(field, { key: "b", ctrlKey: true });
    expect(onToggle).not.toHaveBeenCalled();
    field.remove();
  });

  it("offers no toggle where there is nothing to narrow (the phone drawer)", () => {
    renderSidebar("/lab/database");
    expect(screen.queryByRole("button", { name: messages.nav.collapseMenu })).toBeNull();
  });
});
