import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllAttempts,
  clientAddressFromHeaders,
  loginAttemptKey,
  consumeAttempt,
  resetAttempts,
} from "@/lib/rate-limit";

describe("consumeAttempt", () => {
  beforeEach(() => {
    clearAllAttempts();
  });

  it("allows attempts up to the limit and refuses the next one", () => {
    const options = { limit: 3, windowMs: 1000, now: 0 };
    expect(consumeAttempt("a", options)).toBe(true);
    expect(consumeAttempt("a", options)).toBe(true);
    expect(consumeAttempt("a", options)).toBe(true);
    expect(consumeAttempt("a", options)).toBe(false);
    expect(consumeAttempt("a", options)).toBe(false);
  });

  it("counts each key separately", () => {
    const options = { limit: 1, windowMs: 1000, now: 0 };
    expect(consumeAttempt("a", options)).toBe(true);
    expect(consumeAttempt("b", options)).toBe(true);
    expect(consumeAttempt("a", options)).toBe(false);
  });

  it("opens a fresh window once the old one expires", () => {
    expect(consumeAttempt("a", { limit: 1, windowMs: 1000, now: 0 })).toBe(true);
    expect(consumeAttempt("a", { limit: 1, windowMs: 1000, now: 500 })).toBe(false);
    expect(consumeAttempt("a", { limit: 1, windowMs: 1000, now: 1001 })).toBe(true);
  });

  it("clears a key's allowance on demand", () => {
    const options = { limit: 1, windowMs: 1000, now: 0 };
    expect(consumeAttempt("a", options)).toBe(true);
    expect(consumeAttempt("a", options)).toBe(false);
    resetAttempts("a");
    expect(consumeAttempt("a", options)).toBe(true);
  });
});

describe("clientAddressFromHeaders", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  it("ignores forwarding headers when no proxy is declared", () => {
    // The client can set these itself, so a fresh value per request would mean
    // a fresh bucket per request.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.9" });
    expect(clientAddressFromHeaders(headers)).toBeNull();
  });

  it("takes the last hop of x-forwarded-for behind a trusted proxy", () => {
    process.env.TRUST_PROXY = "1";
    // Only the last entry was appended by the proxy; the rest came from the caller.
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" });
    expect(clientAddressFromHeaders(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip behind a trusted proxy", () => {
    process.env.TRUST_PROXY = "1";
    expect(clientAddressFromHeaders(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("reports no address when a trusted proxy sends neither header", () => {
    process.env.TRUST_PROXY = "1";
    expect(clientAddressFromHeaders(new Headers())).toBeNull();
  });
});

describe("loginAttemptKey", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  it("counts per account when there is no trustworthy address", () => {
    // Never one shared bucket: that would let anyone lock every user out.
    const key = loginAttemptKey(new Headers(), "Admin@Atara.local");
    expect(key).toBe("login:email:admin@atara.local");
  });

  it("counts per address behind a trusted proxy", () => {
    process.env.TRUST_PROXY = "1";
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(loginAttemptKey(headers, "admin@atara.local")).toBe("login:ip:203.0.113.7");
  });

  it("gives two accounts separate allowances without a proxy", () => {
    expect(loginAttemptKey(new Headers(), "a@atara.local")).not.toBe(
      loginAttemptKey(new Headers(), "b@atara.local")
    );
  });
});
