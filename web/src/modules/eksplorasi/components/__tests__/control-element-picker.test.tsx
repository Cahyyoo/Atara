// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { resetPersistedColumns } from "@/core/hooks/use-persisted-columns";
import {
  ControlElementPicker,
  useControlElements,
} from "@/modules/eksplorasi/components/dashboard/control-element-picker";

/** The picker with the choice it keeps, and the choice written out to check against. */
function Harness() {
  const [shown, setShown] = useControlElements();
  return (
    <>
      <ControlElementPicker shown={shown} onChange={setShown} />
      <output aria-label="shown">{shown.join(",")}</output>
    </>
  );
}

const control = en.qcDashboard.control;
const STORAGE_KEY = "atara.eksplorasi.controlElements.v1";

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <Harness />
    </NextIntlClientProvider>
  );
}

const shown = () => screen.getByLabelText("shown").textContent;
const button = (count: number) =>
  screen.getByRole("button", { name: control.elementsCount.replace("{shown}", String(count)).replace("{total}", "7") });
const box = (name: string) => screen.getByRole("menuitemcheckbox", { name });

beforeEach(() => {
  window.localStorage.clear();
  resetPersistedColumns();
});
afterEach(cleanup);

describe("choosing the control charts' elements", () => {
  it("shows every element at first", () => {
    show();
    expect(shown()).toBe("ni,co,fe2o3,al2o3,cr2o3,mgo,sio2");
    expect(button(7)).toBeTruthy();
  });

  it("unticks and ticks elements, keeps their usual order, and remembers the choice", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await user.click(button(7));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Co" }));
    await user.click(box("Fe2O3"));
    await waitFor(() => expect(shown()).toBe("ni,al2o3,cr2o3,mgo,sio2"));
    await user.click(box("Co"));
    await waitFor(() => expect(shown()).toBe("ni,co,al2o3,cr2o3,mgo,sio2"));
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(["ni", "co", "al2o3", "cr2o3", "mgo", "sio2"]);

    // A later visit: the in-memory store is gone, localStorage is not.
    cleanup();
    resetPersistedColumns();
    show();
    expect(shown()).toBe("ni,co,al2o3,cr2o3,mgo,sio2");
  });

  it("brings every element back with Show all, and never lets the last one go", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["mgo"]));
    const user = userEvent.setup({ delay: null });
    show();
    expect(shown()).toBe("mgo");
    await user.click(button(1));
    expect((await screen.findByRole("menuitemcheckbox", { name: "MgO" })).getAttribute("aria-disabled")).toBe("true");

    await user.click(screen.getByRole("menuitem", { name: control.showAll }));
    await waitFor(() => expect(shown()).toBe("ni,co,fe2o3,al2o3,cr2o3,mgo,sio2"));
  });
});
