import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clientFrom,
  deviceDetailRows,
  deviceInfoFrom,
  formatSessionTime,
  parseDeviceInfo,
  summarizeDevice,
  type DeviceInfo,
} from "@/core/lib/auth/session-client";
import { makeClaim, shouldYield } from "@/core/lib/ui/tab-claim";

/**
 * One tab, one browser and one phone per account; the latest sign-in wins and
 * the device it replaces is told what replaced it. These are the parts of that
 * which need no request and no database.
 */

const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const SAFARI_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
/** Chrome's reduced user agent: every Android phone says "Android 10; K". */
const CHROME_ANDROID_REDUCED =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const SAMSUNG_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe("which slot a sign-in takes", () => {
  it("puts the app in the mobile slot by its header", () => {
    expect(clientFrom(headers({ "X-Atara-Client": "mobile" }))).toBe("MOBILE");
    expect(clientFrom(headers({ "x-atara-client": " Mobile " }))).toBe("MOBILE");
  });

  it("treats everything else as a browser, a phone's browser included", () => {
    expect(clientFrom(headers({}))).toBe("WEB");
    expect(clientFrom(headers({ "User-Agent": CHROME_ANDROID_REDUCED }))).toBe("WEB");
  });
});

describe("what the device was", () => {
  it("reads a computer from the user agent alone", () => {
    expect(deviceInfoFrom(headers({ "User-Agent": EDGE_WINDOWS }), "WEB")).toEqual({
      kind: "desktop",
      os: "Windows",
      osVersion: "10/11",
      browser: "Microsoft Edge",
      browserVersion: "129",
      model: null,
      app: false,
    });
  });

  it("tells Windows 11 from 10 when the browser sends the hint", () => {
    const info = deviceInfoFrom(
      headers({
        "User-Agent": EDGE_WINDOWS,
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-CH-UA-Platform-Version": '"15.0.0"',
        "Sec-CH-UA-Full-Version-List":
          '"Microsoft Edge";v="129.0.2792.79", "Not=A?Brand";v="8.0.0.0", "Chromium";v="129.0.6668.90"',
      }),
      "WEB"
    );
    expect(info).toMatchObject({ os: "Windows", osVersion: "11", browser: "Microsoft Edge", browserVersion: "129" });

    const ten = deviceInfoFrom(
      headers({ "User-Agent": EDGE_WINDOWS, "Sec-CH-UA-Platform-Version": '"10.0.0"' }),
      "WEB"
    );
    expect(ten?.osVersion).toBe("10");
  });

  it("does not believe the reduced Android user agent, and takes the hints over it", () => {
    const bare = deviceInfoFrom(headers({ "User-Agent": CHROME_ANDROID_REDUCED }), "WEB");
    expect(bare).toMatchObject({ kind: "phone", os: "Android", osVersion: null, model: null, browser: "Chrome" });

    const hinted = deviceInfoFrom(
      headers({
        "User-Agent": CHROME_ANDROID_REDUCED,
        "Sec-CH-UA-Mobile": "?1",
        "Sec-CH-UA-Platform": '"Android"',
        "Sec-CH-UA-Platform-Version": '"14.0.0"',
        "Sec-CH-UA-Model": '"Pixel 8"',
        "Sec-CH-UA": '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
      }),
      "WEB"
    );
    expect(hinted).toMatchObject({ kind: "phone", os: "Android", osVersion: "14", model: "Pixel 8", browser: "Chrome", browserVersion: "129" });
  });

  it("recognises phones and tablets that send no hints", () => {
    expect(deviceInfoFrom(headers({ "User-Agent": SAFARI_IPHONE }), "WEB")).toMatchObject({
      kind: "phone",
      os: "iOS",
      osVersion: "17.5",
      browser: "Safari",
      browserVersion: "17",
    });
    expect(deviceInfoFrom(headers({ "User-Agent": SAFARI_IPAD }), "WEB")?.kind).toBe("tablet");
    expect(deviceInfoFrom(headers({ "User-Agent": SAMSUNG_TABLET }), "WEB")).toMatchObject({
      kind: "tablet",
      os: "Android",
      osVersion: "13",
      browser: "Samsung Internet",
      model: "SM-X200",
    });
    expect(deviceInfoFrom(headers({ "User-Agent": FIREFOX_LINUX }), "WEB")).toMatchObject({
      kind: "desktop",
      os: "Linux",
      browser: "Firefox",
      browserVersion: "130",
    });
  });

  it("takes the app's word for itself", () => {
    expect(
      deviceInfoFrom(
        headers({
          "X-Atara-Client": "mobile",
          "X-Atara-Device": "android",
          "X-Atara-Device-Model": "Samsung SM-A515F",
          "X-Atara-OS-Version": "14",
        }),
        "MOBILE"
      )
    ).toEqual({
      kind: "phone",
      os: "Android",
      osVersion: "14",
      browser: null,
      browserVersion: null,
      model: "Samsung SM-A515F",
      app: true,
    });
  });

  it("keeps what the app sends short and printable", () => {
    const info = deviceInfoFrom(
      headers({ "X-Atara-Device": "ios", "X-Atara-Device-Model": ` ${"x".repeat(200)}\u0007 ` }),
      "MOBILE"
    );
    expect(info?.model?.length).toBeLessThanOrEqual(60);
    expect(info?.model).not.toContain("\u0007");
  });

  it("admits it does not know rather than inventing a device", () => {
    expect(deviceInfoFrom(headers({}), "WEB")).toBeNull();
    expect(deviceInfoFrom(headers({ "User-Agent": "curl/8.4.0" }), "WEB")).toBeNull();
  });
});

describe("saying it", () => {
  const edge: DeviceInfo = {
    kind: "desktop",
    os: "Windows",
    osVersion: "11",
    browser: "Microsoft Edge",
    browserVersion: "129",
    model: null,
    app: false,
  };
  const app: DeviceInfo = {
    kind: "phone",
    os: "Android",
    osVersion: "14",
    browser: null,
    browserVersion: null,
    model: "Samsung SM-A515F",
    app: true,
  };

  it("sums it up in one neutral line for clients that cannot do better", () => {
    expect(summarizeDevice(edge)).toBe("Windows 11 · Microsoft Edge 129");
    expect(summarizeDevice(app)).toBe("Android 14 · Samsung SM-A515F · Atara app");
    expect(summarizeDevice(null)).toBeNull();
  });

  it("lists the details row by row, leaving out what is unknown", () => {
    expect(deviceDetailRows(edge)).toEqual([
      { label: "detailDevice", kind: "desktop" },
      { label: "detailSystem", value: "Windows 11" },
      { label: "detailBrowser", value: "Microsoft Edge 129" },
    ]);
    expect(deviceDetailRows(app)).toEqual([
      { label: "detailDevice", kind: "phone" },
      { label: "detailSystem", value: "Android 14" },
      { label: "detailApp" },
      { label: "detailModel", value: "Samsung SM-A515F" },
    ]);
    expect(deviceDetailRows(null)).toEqual([]);
  });

  it("reads back stored details without trusting their shape", () => {
    expect(parseDeviceInfo(edge)).toEqual(edge);
    expect(parseDeviceInfo({ ...edge, kind: "fridge" })).toBeNull();
    expect(parseDeviceInfo("Windows")).toBeNull();
    expect(parseDeviceInfo({ kind: "phone", os: 7 })).toMatchObject({ kind: "phone", os: null, app: false });
  });
});

describe("when, as the notices say it", () => {
  const now = new Date("2026-09-30T04:00:00Z"); // 12:00 WITA

  it("gives the time alone for today, on the lab's clock", () => {
    expect(formatSessionTime("2026-09-30T01:12:00Z", now)).toBe("09:12");
  });

  it("adds the date for another day", () => {
    expect(formatSessionTime("2026-09-29T10:40:00Z", now)).toBe("2026-09-29 18:40");
  });

  it("gives nothing for something unreadable", () => {
    expect(formatSessionTime("not a date", now)).toBe("");
  });
});

describe("one tab at a time", () => {
  it("steps aside for another tab's claim", () => {
    expect(shouldYield(makeClaim("other"), "mine")).toBe(true);
  });

  it("does not step aside for its own claim, or for anything else", () => {
    expect(shouldYield(makeClaim("mine"), "mine")).toBe(false);
    expect(shouldYield({ type: "hello", tabId: "other" }, "mine")).toBe(false);
    expect(shouldYield(null, "mine")).toBe(false);
    expect(shouldYield("claim", "mine")).toBe(false);
  });
});

describe("where it is enforced", () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

  it("refuses a token that names no session", () => {
    expect(read("core", "lib", "auth", "auth.ts")).toContain('typeof payload.sid === "string"');
  });

  it("never asks before signing the other device out: the latest sign-in wins", () => {
    const login = read("app", "api", "(core)", "auth", "login", "route.ts");
    expect(login).not.toContain("409");
    expect(login).not.toContain("takeoverDecision");
    expect(read("core", "components", "auth", "login-form.tsx")).not.toContain("canConfirmTakeover");
  });

  it("starts every session in one place, which is where the old one ends", () => {
    expect(read("core", "lib", "auth", "session-response.ts")).toContain("startSession(user.id, headers)");
    expect(read("core", "lib", "auth", "user-session.ts")).toContain('endedReason: "REPLACED"');
    for (const route of ["login", "face", "totp"]) {
      expect(read("app", "api", "(core)", "auth", route, "route.ts"), route).toContain(
        "issueSessionResponse(user, request.headers"
      );
    }
  });

  it("tells the replaced device what replaced it", () => {
    expect(read("core", "lib", "http", "api-auth.ts")).toContain("deviceInfo: state.deviceInfo");
  });

  it("ends the session on the server when signing out", () => {
    expect(read("app", "api", "(core)", "auth", "logout", "route.ts")).toContain("endSession(");
  });

  it("watches for another device and another tab in every signed-in page", () => {
    const shell = read("core", "components", "layout", "app-shell.tsx");
    expect(shell).toContain("<SessionWatch />");
    expect(shell).toContain("<TabLock />");
  });
});
