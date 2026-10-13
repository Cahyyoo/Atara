// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { HelpToc } from "@/core/components/help/help-toc";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let fire: Callback = () => {};

class FakeObserver {
  constructor(callback: Callback) {
    fire = callback;
  }
  observe() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the guide's contents", () => {
  it("marks the section being read", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(
      <>
        <HelpToc
          label="Contents"
          sections={[
            { key: "dashboard", title: "Dashboard" },
            { key: "database", title: "Sample Database" },
          ]}
        />
        <section id="dashboard" />
        <section id="database" />
      </>
    );

    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();

    act(() => {
      fire([
        {
          isIntersecting: true,
          target: document.getElementById("database")!,
          boundingClientRect: { top: 120 } as DOMRectReadOnly,
        },
      ]);
    });

    expect(screen.getByRole("link", { name: "Sample Database" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });
});
