import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";

/**
 * The parts of the sign-in screens that are wrong in ways nothing else
 * notices: text that overflows its button, a placeholder that reads as an
 * answer, a fallback filed away from the thing it is a fallback for.
 *
 * None of it is a type error and none of it fails a render. It just makes the
 * screen harder to use than it needs to be, one small decision at a time.
 */

const MFA = join(process.cwd(), "src", "components", "mfa");

/**
 * The component with its comments stripped.
 *
 * Checking the raw text means a comment explaining why something is no longer
 * used counts as a use of it -- which is how the first run of this failed, on
 * the sentence describing the break-all it had just removed. A check that
 * trips over its own explanation teaches people to stop writing explanations.
 *
 * The authenticator work is still untracked, so a missing file reads as empty
 * rather than failing a fresh clone.
 */
function mfa(name: string): string {
  const path = join(MFA, name);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("the way back out", () => {
  /**
   * This test exists because of how the last attempt failed.
   *
   * `backToPassword` is defined in two namespaces. One was shortened, the
   * other was not, and every MFA screen reads the one that was not -- so the
   * thirty-five character label stayed on screen while the fix was reported
   * as done. Checking one place is what made that possible, so this checks
   * every place.
   */
  it("is short in every namespace and both languages", () => {
    const found: string[] = [];

    for (const [language, messages] of [["en", en], ["id", id]] as const) {
      for (const [namespace, group] of Object.entries(messages)) {
        const label = (group as Record<string, unknown>)?.backToPassword;
        if (typeof label !== "string") continue;
        found.push(`${language}.${namespace}`);
        expect(label.length, `${language}.${namespace}: ${label}`).toBeLessThan(25);
      }
    }

    // A scan that stops finding anything would pass in silence, which is the
    // same failure again in a different costume.
    expect(found.length).toBeGreaterThanOrEqual(4);
  });
});

describe("the six-digit field", () => {
  const FORM = mfa("totp-code-form.tsx");
  const BOXES = mfa("otp-input.tsx");

  it("does not dress an empty field as an answer", () => {
    /**
     * "000000" in the same mono, size and tracking as a real code reads as a
     * field somebody already filled in. People either think they typed it or
     * think they have to clear it first, and both are a pause in the one
     * screen that should be over in five seconds. Empty boxes stay empty.
     */
    if (!BOXES) return;
    expect(BOXES).not.toContain("placeholder");
    expect(FORM).not.toContain('placeholder="000000"');
  });

  it("still shows the shape of what is wanted", () => {
    // Six boxes, three and three, the way Authenticator shows the code.
    if (!FORM || !BOXES) return;
    expect(FORM).toContain("<OtpInput");
    expect(FORM).toContain("length={CODE_LENGTH}");
    expect(BOXES).toContain("Math.ceil(length / 2)");
  });

  it("is one real input underneath, so paste and autofill work", () => {
    if (!BOXES) return;
    expect(BOXES.split("<input").length - 1).toBe(1);
    expect(BOXES).toContain('autoComplete="one-time-code"');
  });
});

describe("the manual key", () => {
  const SETUP = mfa("totp-setup-step.tsx");

  it("takes the QR code's place instead of opening under it", () => {
    /**
     * It is what to do *instead of* scanning. It used to open below the QR
     * code, which made the card taller exactly when somebody was already
     * struggling -- and on a short window, that is what made the page scroll.
     */
    if (!SETUP) return;
    const qr = SETUP.indexOf("<QRCodeSVG");
    const key = SETUP.indexOf("setup.manualKey");
    expect(qr).toBeGreaterThan(-1);
    expect(key).toBeGreaterThan(qr);
    expect(SETUP.slice(SETUP.indexOf("!showKey ?"), key)).toContain(") : (");
  });

  it("opens nothing downwards", () => {
    if (!SETUP) return;
    expect(SETUP).not.toContain("<details");
  });

  it("keeps its groups whole", () => {
    // break-all split the last group of four across two lines. A key that is
    // typed by hand is exactly the one that must not be broken mid-group.
    if (!SETUP) return;
    expect(SETUP).not.toContain("break-all");
    expect(SETUP).toContain("break-words");
  });
});

describe("the setup step's proportions", () => {
  const SETUP = mfa("totp-setup-step.tsx");
  const PAGE = readFileSync(join(process.cwd(), "src", "app", "login", "page.tsx"), "utf8");

  it("stays as narrow as every other step", () => {
    /**
     * It used to widen the card to two columns, which split "enter the code"
     * from the field it was about and made this one step jump in width. It
     * is two screens now -- the QR code, then the code -- each in the card
     * every other step uses.
     */
    if (!SETUP) return;
    expect(SETUP).not.toContain("data-login-wide");
    expect(PAGE).not.toContain("data-login-wide");
  });

  it("never shows the QR code and the code field at once", () => {
    if (!SETUP) return;
    const scan = SETUP.indexOf('phase === "scan"');
    expect(scan).toBeGreaterThan(-1);
    // The QR belongs to the scan branch, the code form to the other one.
    expect(SETUP.indexOf("QRCodeSVG", scan)).toBeLessThan(SETUP.indexOf("<TotpCodeForm"));
    expect(SETUP.slice(scan, SETUP.indexOf("<TotpCodeForm"))).toContain(") : (");
  });

  it("does not make the secondary action outweigh the primary one", () => {
    // The eye reads size and fill as importance: what the screen is for is
    // the one filled button, and the ways out are links sharing one line.
    if (!SETUP) return;
    expect(SETUP.split("<Button").length - 1).toBe(1);
    expect(SETUP).toContain('className="h-10 w-full gap-2"');
    expect(SETUP).toContain("onClick={onSwitchMethod} className={cn(linkClass");
  });

  it("lets the QR code give way on a short window", () => {
    // Sized from the window's height, so nothing below it is pushed out of
    // view and the page never has to scroll.
    if (!SETUP) return;
    expect(SETUP).toMatch(/size-\[clamp\([^)]*dvh[^)]*\)\]/);
  });
});
