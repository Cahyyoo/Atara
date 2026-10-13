// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAccess, type QuickAccessLabels } from "@/core/components/launcher/quick-access";

// The dialog itself is the account menu's and tested there; here, only that
// the launcher's button opens it.
vi.mock("@/core/components/layout/change-password-dialog", () => ({
  ChangePasswordDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">password dialog</div> : null),
}));

const LABELS: QuickAccessLabels = {
  title: "Quick access",
  account: "Your account",
  guide: "User guide",
  guideHint: "How to use every page",
  tour: "Quick tour",
  tourHint: "A minute",
  password: "Change password",
  passwordHint: "Update it",
};

function renderPanel() {
  return render(
    <QuickAccess
      name="Lab Admin"
      email="admin@atara.local"
      badges={[
        { label: "Admin Lab", variant: "default" },
        { label: "Lab", variant: "secondary" },
      ]}
      tourHref="/home?tour=account"
      labels={LABELS}
    />
  );
}

afterEach(cleanup);

describe("the launcher's quick access", () => {
  it("names the account with its initials and its role", () => {
    renderPanel();
    const account = screen.getByRole("region", { name: LABELS.account });

    expect(account.textContent).toContain("LA");
    expect(account.textContent).toContain("Lab Admin");
    expect(account.textContent).toContain("admin@atara.local");
    expect(account.textContent).toContain("Admin Lab");
  });

  it("leads to the guide and to the account tour", () => {
    renderPanel();

    expect(screen.getByRole("link", { name: new RegExp(LABELS.guide) }).getAttribute("href")).toBe("/help");
    expect(screen.getByRole("link", { name: new RegExp(LABELS.tour) }).getAttribute("href")).toBe("/home?tour=account");
  });

  it("opens the change-password dialog in place", async () => {
    renderPanel();
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: new RegExp(LABELS.password) }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
