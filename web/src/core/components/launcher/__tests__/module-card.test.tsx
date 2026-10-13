// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { IoFlaskOutline } from "react-icons/io5";
import { ModuleCard, SHORTCUT_LIMIT, type LauncherShortcut } from "@/core/components/launcher/module-card";

const shortcut = (n: number): LauncherShortcut => ({ href: `/lab/page-${n}`, label: `Page ${n}`, icon: IoFlaskOutline });

function renderCard(shortcuts: LauncherShortcut[]) {
  return render(
    <ModuleCard
      href="/lab/dashboard"
      icon={IoFlaskOutline}
      name="Lab"
      description="Samples"
      shortcutsLabel="Go straight to"
      shortcuts={shortcuts}
      moreLabel={(count) => `+${count} more`}
    />
  );
}

afterEach(cleanup);

describe("a card on the launcher", () => {
  it("opens the module from its title, and each page from its own link", () => {
    renderCard([shortcut(1), shortcut(2)]);

    expect(screen.getByRole("link", { name: "Lab" }).getAttribute("href")).toBe("/lab/dashboard");
    expect(screen.getByRole("link", { name: "Page 1" }).getAttribute("href")).toBe("/lab/page-1");
    expect(screen.getByRole("link", { name: "Page 2" }).getAttribute("href")).toBe("/lab/page-2");
  });

  it("never puts a link inside another, so each is its own stop for Tab", () => {
    const { container } = renderCard([shortcut(1), shortcut(2)]);
    expect(container.querySelector("a a")).toBeNull();
  });

  it("names the first pages and counts the rest, the rest opening the module", () => {
    renderCard(Array.from({ length: SHORTCUT_LIMIT + 2 }, (_, n) => shortcut(n + 1)));
    const list = within(screen.getByRole("list"));

    expect(list.getAllByRole("link")).toHaveLength(SHORTCUT_LIMIT + 1);
    expect(list.getByRole("link", { name: "+2 more" }).getAttribute("href")).toBe("/lab/dashboard");
  });

  it("lists nothing when the person may open no page of it", () => {
    renderCard([]);
    expect(screen.queryByText("Go straight to")).toBeNull();
  });
});
