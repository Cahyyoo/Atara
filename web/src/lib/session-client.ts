import { formatWitaDateTime } from "@/lib/shift-date";

/**
 * Which slot a sign-in takes, and what the device it came from was.
 *
 * An account may be signed in on one browser and one phone at a time; the
 * latest sign-in in a slot ends the one before it, and the device it ended is
 * told what took its place. These are the pure parts of that, so they can be
 * tested without a request or a database.
 */

export type SessionClient = "WEB" | "MOBILE";

/** Sent by the mobile app on every request. Anything else is a browser. */
export const CLIENT_HEADER = "x-atara-client";
/** Sent by the mobile app: "android" or "ios". */
export const DEVICE_HEADER = "x-atara-device";
/** Sent by the mobile app: "Samsung SM-A515F", "iPhone15,2". */
export const DEVICE_MODEL_HEADER = "x-atara-device-model";
/** Sent by the mobile app: "14", "17.5". */
export const OS_VERSION_HEADER = "x-atara-os-version";

export function clientFrom(headers: Headers): SessionClient {
  return headers.get(CLIENT_HEADER)?.trim().toLowerCase() === "mobile" ? "MOBILE" : "WEB";
}

/**
 * What a device was, as data rather than a sentence, so each device that is
 * told about it can say it in its own language: "Komputer" here, "Computer"
 * there. Everything but `kind` and `app` is a proper name or a number and
 * needs no translating.
 */
export interface DeviceInfo {
  kind: "desktop" | "phone" | "tablet";
  /** "Windows", "Android", "iOS", "macOS", "Linux", "ChromeOS". */
  os: string | null;
  /** "10/11", "11", "14", "17.5". */
  osVersion: string | null;
  /** "Microsoft Edge", "Chrome", "Firefox", "Safari"; null for the app. */
  browser: string | null;
  /** Major version only: "129". */
  browserVersion: string | null;
  /** "Samsung SM-A515F", "Pixel 8"; null whenever the device does not say. */
  model: string | null;
  /** The Atara mobile app rather than a browser. */
  app: boolean;
}

const MAX_PART_CHARS = 60;
const MAX_SUMMARY_CHARS = 120;

/**
 * A header value fit to be stored and shown: trimmed, quotes of a structured
 * header removed, control characters dropped, capped. Empty is absent.
 */
function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim()
    .slice(0, MAX_PART_CHARS);
  return text === "" ? null : text;
}

const APP_SYSTEMS: Record<string, string> = { android: "Android", ios: "iOS" };

/** The brands a Chromium browser lists that are not its own name. */
const FILLER_BRAND = /not.?a.?brand|^chromium$/i;
const BRAND_NAMES: Record<string, string> = {
  "Google Chrome": "Chrome",
  "Microsoft Edge": "Microsoft Edge",
  Opera: "Opera",
  "Samsung Internet": "Samsung Internet",
};

/**
 * The browser from a client-hints brand list:
 * `"Chromium";v="129.0.1", "Microsoft Edge";v="129.0.2", "Not=A?Brand";v="8"`.
 * The first brand that is neither filler nor plain Chromium is the browser;
 * Chromium itself only when nothing else is listed.
 */
function browserFromBrands(list: string | null): { browser: string; version: string } | null {
  if (!list) return null;
  const brands = [...list.matchAll(/"([^"]+)";\s*v="([^"]+)"/g)].map(([, name, version]) => ({
    name,
    version: version.split(".")[0],
  }));
  const own = brands.find((brand) => !FILLER_BRAND.test(brand.name));
  const chosen = own ?? brands.find((brand) => /^chromium$/i.test(brand.name));
  if (!chosen) return null;
  return { browser: BRAND_NAMES[chosen.name] ?? chosen.name, version: chosen.version };
}

/** Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari". */
const UA_BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, "Microsoft Edge"],
  [/\bOPR\/(\d+)/, "Opera"],
  [/\bSamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/\b(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
  [/\bVersion\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
];

function browserFromUserAgent(ua: string): { browser: string; version: string | null } | null {
  for (const [pattern, name] of UA_BROWSERS) {
    const match = ua.match(pattern);
    if (match) return { browser: name, version: match[1] ?? null };
  }
  return null;
}

/**
 * Windows 10 and 11 send the same user agent. Only the platform-version hint
 * tells them apart: 13 and above is 11, anything from 1 up is 10.
 */
function windowsVersion(platformVersion: string | null): string {
  const major = Number(platformVersion?.split(".")[0]);
  if (!Number.isFinite(major) || platformVersion === null) return "10/11";
  if (major >= 13) return "11";
  if (major >= 1) return "10";
  return "10/11";
}

function systemFromUserAgent(ua: string): { os: string; osVersion: string | null } | null {
  // Chrome's reduced user agent says "Android 10; K" on every Android device,
  // whatever its real version. Only the client hint knows better.
  if (/\bAndroid 10; K\)/.test(ua)) return { os: "Android", osVersion: null };
  const android = ua.match(/\bAndroid (\d+(?:\.\d+)?)/);
  if (android) return { os: "Android", osVersion: android[1].replace(/\.0$/, "") };
  const ios = ua.match(/\b(?:iPhone|iPad|iPod)\b.*? OS (\d+)_(\d+)/);
  if (ios) return { os: "iOS", osVersion: `${ios[1]}.${ios[2]}` };
  if (/\bWindows NT 10\.0\b/.test(ua)) return { os: "Windows", osVersion: "10/11" };
  if (/\bWindows NT 6\.3\b/.test(ua)) return { os: "Windows", osVersion: "8.1" };
  if (/\bWindows NT 6\.1\b/.test(ua)) return { os: "Windows", osVersion: "7" };
  if (/\bWindows\b/.test(ua)) return { os: "Windows", osVersion: null };
  // Safari froze the macOS version in its user agent years ago; saying
  // "10.15" would be confidently wrong.
  if (/\bMacintosh\b|\bMac OS X\b/.test(ua)) return { os: "macOS", osVersion: null };
  if (/\bCrOS\b/.test(ua)) return { os: "ChromeOS", osVersion: null };
  if (/\bLinux\b/.test(ua)) return { os: "Linux", osVersion: null };
  return null;
}

/** Chrome's reduced user agent says "K" where the model was; that is not a model. */
function modelFromUserAgent(ua: string): string | null {
  const match = ua.match(/\bAndroid [^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\)/);
  const model = match?.[1]?.trim();
  if (!model || model === "K" || model === "wv" || /^[a-z]{2}-[a-z]{2}$/i.test(model)) return null;
  return model.slice(0, MAX_PART_CHARS);
}

/**
 * Phone, tablet or computer. Android browsers mark phones with "Mobile" and
 * leave it off on tablets -- the reduced user agent keeps that much.
 */
function kindFrom(ua: string, mobileHint: string | null, os: string | null): DeviceInfo["kind"] {
  if (/\biPad\b/.test(ua)) return "tablet";
  if (/\b(iPhone|iPod)\b/.test(ua) || mobileHint === "?1") return "phone";
  if (os === "Android") return /\bMobile\b/.test(ua) ? "phone" : "tablet";
  return "desktop";
}

/**
 * Everything a sign-in's headers say about the device it came from.
 *
 * A browser is read from client hints where it sent them (Chromium, over
 * HTTPS or localhost, after next.config.ts asked for them) and from its user
 * agent otherwise. The app says what it is in its own headers. Nothing here
 * is trusted for anything but the sentence it ends up in.
 */
export function deviceInfoFrom(headers: Headers, client: SessionClient): DeviceInfo | null {
  if (client === "MOBILE") {
    const os = APP_SYSTEMS[clean(headers.get(DEVICE_HEADER))?.toLowerCase() ?? ""] ?? null;
    const model = clean(headers.get(DEVICE_MODEL_HEADER));
    return {
      kind: model?.startsWith("iPad") ? "tablet" : "phone",
      os,
      osVersion: clean(headers.get(OS_VERSION_HEADER)),
      browser: null,
      browserVersion: null,
      model,
      app: true,
    };
  }

  const ua = headers.get("user-agent") ?? "";
  const hintPlatform = clean(headers.get("sec-ch-ua-platform"));
  const hintVersion = clean(headers.get("sec-ch-ua-platform-version"));
  const mobileHint = clean(headers.get("sec-ch-ua-mobile"));

  const fromUa = systemFromUserAgent(ua);
  const os = hintPlatform ?? fromUa?.os ?? null;
  let osVersion = fromUa?.os === os ? (fromUa?.osVersion ?? null) : null;
  if (os === "Windows") osVersion = windowsVersion(hintVersion);
  else if (hintVersion && (os === "Android" || os === "macOS")) {
    osVersion = hintVersion.split(".")[0];
  }

  const browser =
    browserFromBrands(clean(headers.get("sec-ch-ua-full-version-list"))) ??
    browserFromBrands(headers.get("sec-ch-ua")) ??
    browserFromUserAgent(ua);

  const model = clean(headers.get("sec-ch-ua-model")) ?? modelFromUserAgent(ua);

  if (!os && !browser) return null;
  return {
    kind: kindFrom(ua, mobileHint, os),
    os,
    osVersion,
    browser: browser?.browser ?? null,
    browserVersion: browser?.version ?? null,
    model,
    app: false,
  };
}

/**
 * One line, in no particular language, for anything that cannot render the
 * structured form -- an older app build, the database row read by a person:
 * "Windows 10/11 · Microsoft Edge 129", "Android 14 · Samsung SM-A515F · Atara app".
 */
export function summarizeDevice(info: DeviceInfo | null): string | null {
  if (!info) return null;
  const system = [info.os, info.osVersion].filter(Boolean).join(" ");
  const software = info.app
    ? "Atara app"
    : [info.browser, info.browserVersion].filter(Boolean).join(" ");
  const parts = [system, info.model, software].filter((part) => part && part.length > 0);
  const summary = parts.join(" · ").slice(0, MAX_SUMMARY_CHARS);
  return summary === "" ? null : summary;
}

/**
 * The rows of the "signed in elsewhere" notice, in order, leaving out every
 * row there is nothing to say in. `kind` is a key for the reader's language;
 * every other value is a proper name or a number and is shown as it is.
 */
export type DeviceDetailRow =
  | { label: "detailDevice"; kind: DeviceInfo["kind"] }
  | { label: "detailSystem" | "detailBrowser" | "detailModel"; value: string }
  | { label: "detailApp" };

export function deviceDetailRows(info: DeviceInfo | null): DeviceDetailRow[] {
  if (!info) return [];
  const rows: DeviceDetailRow[] = [{ label: "detailDevice", kind: info.kind }];
  const system = [info.os, info.osVersion].filter(Boolean).join(" ");
  if (system) rows.push({ label: "detailSystem", value: system });
  if (info.app) rows.push({ label: "detailApp" });
  else {
    const browser = [info.browser, info.browserVersion].filter(Boolean).join(" ");
    if (browser) rows.push({ label: "detailBrowser", value: browser });
  }
  if (info.model) rows.push({ label: "detailModel", value: info.model });
  return rows;
}

/** Reads back a stored or received DeviceInfo, trusting nothing about its shape. */
export function parseDeviceInfo(value: unknown): DeviceInfo | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : null);
  const kind = record.kind;
  if (kind !== "desktop" && kind !== "phone" && kind !== "tablet") return null;
  return {
    kind,
    os: text("os"),
    osVersion: text("osVersion"),
    browser: text("browser"),
    browserVersion: text("browserVersion"),
    model: text("model"),
    app: record.app === true,
  };
}

/**
 * When a session started or ended, as the notices say it: "09:12" when it is
 * today, "2026-09-29 18:40" when it is not -- on the lab's clock, like every
 * other time in the app. Empty for anything unreadable, and the notices then
 * read without it.
 */
export function formatSessionTime(at: string | Date, now: Date = new Date()): string {
  const stamp = formatWitaDateTime(at);
  if (!stamp) return "";
  const today = formatWitaDateTime(now)?.slice(0, 10);
  const [day, time] = stamp.split(" ");
  const hhmm = time.slice(0, 5);
  return day === today ? hhmm : `${day} ${hhmm}`;
}
