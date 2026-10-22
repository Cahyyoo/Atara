import { describe, expect, it } from "vitest";
import type { Access } from "@/core/lib/auth/permissions";
import { activeNavItem, moduleEntryPath, moduleForPath, modulesFor, navFor } from "@/core/lib/app/modules";

/**
 * The launcher and the module view (as in Odoo): which module a page belongs
 * to decides whether the shell shows a sidebar and which menu is in it.
 */

const SUPER: Access = { role: "SUPER_ADMIN", department: null };
const LAB_ADMIN: Access = { role: "ADMIN", department: "LAB" };
const PREPARATOR: Access = { role: "PREPARATOR", department: "LAB" };

const keyOf = (pathname: string) => moduleForPath(pathname)?.key ?? null;

describe("the module a page belongs to", () => {
  it("is the one whose path holds it", () => {
    expect(keyOf("/lab")).toBe("lab");
    expect(keyOf("/lab/dashboard")).toBe("lab");
    expect(keyOf("/lab/samples/NKL-1/sub/-20")).toBe("lab");
    expect(keyOf("/eksplorasi/data-source")).toBe("eksplorasi");
    expect(keyOf("/admin")).toBe("system");
    expect(keyOf("/admin/sign-ins")).toBe("system");
  });

  it("counts a page in a module's menu that sits outside its path", () => {
    expect(keyOf("/users")).toBe("system");
  });

  it("is nobody's for the launcher and the guide, which show no sidebar", () => {
    expect(keyOf("/home")).toBeNull();
    expect(keyOf("/help")).toBeNull();
    expect(keyOf("/")).toBeNull();
  });

  it("matches whole path segments, not letters", () => {
    expect(keyOf("/labx")).toBeNull();
    expect(keyOf("/usersettings")).toBeNull();
  });
});

describe("a card on the launcher", () => {
  const settings = () => modulesFor(SUPER).find((m) => m.key === "system")!;

  it("opens the module's home when the person may open it", () => {
    expect(moduleEntryPath(SUPER, settings())).toBe("/admin");
    const lab = modulesFor(PREPARATOR).find((m) => m.key === "lab")!;
    expect(moduleEntryPath(PREPARATOR, lab)).toBe("/lab/dashboard");
  });

  it("opens the first page the person may, when the home is not theirs", () => {
    // The lab admin's settings are Users only; /admin would turn them away.
    expect(moduleEntryPath(LAB_ADMIN, settings())).toBe("/users");
  });

  it("lists only the menus the person may open", () => {
    expect(navFor(LAB_ADMIN, settings()).map((item) => item.href)).toEqual(["/users"]);
    expect(navFor(SUPER, settings()).map((item) => item.href)).toEqual(["/users", "/admin", "/admin/sign-ins"]);
    const lab = modulesFor(PREPARATOR).find((m) => m.key === "lab")!;
    expect(navFor(PREPARATOR, lab).map((item) => item.href)).toEqual(["/lab/dashboard"]);
  });
});

describe("the menu item a page is", () => {
  const items = [{ href: "/admin" }, { href: "/admin/sign-ins" }, { href: "/users" }];

  it("is the most specific match", () => {
    expect(activeNavItem("/admin/sign-ins", items)?.href).toBe("/admin/sign-ins");
    expect(activeNavItem("/admin", items)?.href).toBe("/admin");
    expect(activeNavItem("/users", items)?.href).toBe("/users");
  });

  it("is none for a page with no menu entry", () => {
    expect(activeNavItem("/lab/samples/NKL-1", [{ href: "/lab/database" }])).toBeNull();
    expect(activeNavItem("/adminx", items)).toBeNull();
  });
});
