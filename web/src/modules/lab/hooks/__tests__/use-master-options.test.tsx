// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * The vocabularies are asked for ahead of time and remembered, so a form
 * opens with its codes in place -- and still asks again, for a code added
 * since. Each test starts on a fresh module, with nothing remembered.
 */

const OPTIONS = [{ id: "p1", kind: "PLACE", code: "MOL", label: null, sortOrder: 0, isActive: true }];

let calls = 0;

beforeEach(() => {
  vi.resetModules();
  calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls += 1;
      return { ok: true, json: async () => ({ success: true, data: { options: OPTIONS } }) };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function load() {
  const hook = await import("@/modules/lab/hooks/use-master-options");
  function Codes() {
    const options = hook.useMasterOptions();
    return <p data-testid="codes">{options.map((option) => option.code).join(",") || "none"}</p>;
  }
  return { ...hook, Codes };
}

describe("useMasterOptions", () => {
  it("starts a second form on the remembered codes, and still asks again", async () => {
    const { Codes } = await load();
    render(<Codes />);
    expect(screen.getByTestId("codes").textContent).toBe("none");
    await waitFor(() => expect(screen.getByTestId("codes").textContent).toBe("MOL"));
    cleanup();

    render(<Codes />);
    // From the first frame, not after a round trip.
    expect(screen.getByTestId("codes").textContent).toBe("MOL");
    await waitFor(() => expect(calls).toBe(2));
  });

  it("asks once for everyone who asks at the same time", async () => {
    const { prefetchMasterOptions } = await load();
    const [first, second] = await Promise.all([prefetchMasterOptions(), prefetchMasterOptions()]);
    expect(first).toEqual(OPTIONS);
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it("answers null, and remembers nothing, when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );
    const { prefetchMasterOptions } = await load();
    expect(await prefetchMasterOptions()).toBeNull();
  });
});
