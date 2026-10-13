// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { id as messages } from "@/core/i18n/test-messages";
import { LoginForm } from "@/core/components/auth/login-form";

const push = vi.fn();
const refresh = vi.fn();
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => searchParams,
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <LoginForm />
    </NextIntlClientProvider>
  );
}

function mockLogin(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => body })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.delete("next");
  mockLogin({ success: true, data: {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginForm", () => {
  it("does not prefill an account name", () => {
    renderForm();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
  });

  it("puts the cursor in the email field", () => {
    renderForm();
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("masks the password until the reveal is pressed", async () => {
    const user = userEvent.setup();
    renderForm();

    const password = screen.getByLabelText("Kata Sandi") as HTMLInputElement;
    expect(password.type).toBe("password");

    await user.click(screen.getByRole("button", { name: "Tampilkan kata sandi" }));
    expect(password.type).toBe("text");

    await user.click(screen.getByRole("button", { name: "Sembunyikan kata sandi" }));
    expect(password.type).toBe("password");
  });

  it("announces a failure rather than only recolouring it", async () => {
    const user = userEvent.setup();
    mockLogin({ success: false, error: "Incorrect email or password." }, false);
    renderForm();

    await user.type(screen.getByLabelText("Email"), "admin@atara.local");
    await user.type(screen.getByLabelText("Kata Sandi"), "wrong");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Incorrect email or password.");
    expect(push).not.toHaveBeenCalled();
  });

  it("goes to the portal on success", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Email"), "admin@atara.local");
    await user.type(screen.getByLabelText("Kata Sandi"), "Admin123!");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
  });

  it("goes to change the password first when an administrator chose it", async () => {
    const user = userEvent.setup();
    searchParams.set("next", "/assay");
    mockLogin({ success: true, data: { mustChangePassword: true } });
    renderForm();

    await user.type(screen.getByLabelText("Email"), "new@atara.local");
    await user.type(screen.getByLabelText("Kata Sandi"), "Given1234!");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/change-password?next=%2Fassay"));
  });

  it("refuses to follow an off-site next parameter", async () => {
    const user = userEvent.setup();
    searchParams.set("next", "https://evil.example");
    renderForm();

    await user.type(screen.getByLabelText("Email"), "admin@atara.local");
    await user.type(screen.getByLabelText("Kata Sandi"), "Admin123!");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
    expect(push).not.toHaveBeenCalledWith("https://evil.example");
  });

  describe("the second factor", () => {
    function mockSequence(...bodies: { ok?: boolean; body: unknown }[]) {
      const fetchMock = vi.fn();
      for (const { ok = true, body } of bodies) {
        fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
      }
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    const challenge = { challenge: "challenge-token", expiresIn: 120, user: { name: "Sari" } };

    async function signIn(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText("Email"), "sari@atara.local");
      await user.type(screen.getByLabelText("Kata Sandi"), "Operator123!");
      await user.click(screen.getByRole("button", { name: "Masuk" }));
    }

    it("offers a choice when the account has a face and an authenticator", async () => {
      const user = userEvent.setup();
      mockSequence({ body: { success: true, data: { mfaRequired: true, methods: ["face", "totp"], ...challenge } } });
      renderForm();
      await signIn(user);

      expect(await screen.findByRole("button", { name: /Verifikasi wajah/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Kode Authenticator/ })).toBeTruthy();
      expect(push).not.toHaveBeenCalled();
    });

    it("signs in with a code and can go back to the choice", async () => {
      const user = userEvent.setup();
      const fetchMock = mockSequence(
        { body: { success: true, data: { mfaRequired: true, methods: ["face", "totp"], ...challenge } } },
        { body: { success: true, data: { token: "session" } } }
      );
      renderForm();
      await signIn(user);

      await user.click(await screen.findByRole("button", { name: /Kode Authenticator/ }));

      // Switching away and back again does not cost the password.
      await user.click(screen.getByRole("button", { name: "Gunakan metode lain" }));
      await user.click(await screen.findByRole("button", { name: /Kode Authenticator/ }));

      await user.type(screen.getByLabelText("Kode 6 digit"), "123456");

      await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe("/api/auth/totp");
      expect(JSON.parse(init.body)).toEqual({ challenge: "challenge-token", code: "123456" });
    });

    it("goes straight to the code when it is the only method", async () => {
      const user = userEvent.setup();
      mockSequence(
        { body: { success: true, data: { mfaRequired: true, methods: ["totp"], ...challenge } } },
        { ok: false, body: { success: false, error: "That code is not correct.", code: "totp-mismatch" } }
      );
      renderForm();
      await signIn(user);

      await user.type(await screen.findByLabelText("Kode 6 digit"), "000000");

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Kode salah");
      expect(screen.queryByRole("button", { name: "Gunakan metode lain" })).toBeNull();
      expect(push).not.toHaveBeenCalled();

      // Emptied and back in focus, so the next code is simply typed.
      const input = screen.getByLabelText("Kode 6 digit") as HTMLInputElement;
      await waitFor(() => expect(document.activeElement).toBe(input));
      expect(input.value).toBe("");
    });

    it("takes a pasted code the way Authenticator shows it", async () => {
      const user = userEvent.setup();
      const fetchMock = mockSequence(
        { body: { success: true, data: { mfaRequired: true, methods: ["totp"], ...challenge } } },
        { body: { success: true, data: { token: "session" } } }
      );
      renderForm();
      await signIn(user);

      await user.click(await screen.findByLabelText("Kode 6 digit"));
      await user.paste("123 456");

      await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).code).toBe("123456");
    });

    it("shows the QR code for a setup an admin asked for", async () => {
      const user = userEvent.setup();
      const fetchMock = mockSequence(
        { body: { success: true, data: { mfaRequired: true, methods: ["totp-setup"], ...challenge } } },
        {
          body: {
            success: true,
            data: {
              otpauthUri: "otpauth://totp/ATARA:sari%40atara.local?secret=GEZDGNBV&issuer=ATARA",
              manualKey: "GEZD GNBV",
              challenge: "fresh-challenge",
              expiresIn: 120,
            },
          },
        },
        { body: { success: true, data: { token: "session" } } }
      );
      renderForm();
      await signIn(user);

      expect(await screen.findByRole("img", { name: "Kode QR untuk Microsoft Authenticator" })).toBeTruthy();
      // The key takes the QR code's place rather than opening under it.
      expect(screen.queryByText("GEZD GNBV")).toBeNull();
      await user.click(screen.getByRole("button", { name: "Tidak bisa memindai? Tampilkan kunci" }));
      expect(screen.getByText("GEZD GNBV")).toBeTruthy();
      expect(screen.queryByRole("img", { name: "Kode QR untuk Microsoft Authenticator" })).toBeNull();
      await user.click(screen.getByRole("button", { name: "Tampilkan kode QR" }));
      expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/totp/setup");

      // One thing per screen: the code field only once the QR is dealt with.
      expect(screen.queryByLabelText("Kode 6 digit")).toBeNull();
      await user.click(screen.getByRole("button", { name: "Lanjut" }));

      // Back to the QR and forward again does not make a new secret: the
      // phone may already have scanned this one.
      await user.click(screen.getByRole("button", { name: "Tampilkan kode QR lagi" }));
      expect(screen.getByRole("img", { name: "Kode QR untuk Microsoft Authenticator" })).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Lanjut" }));
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await user.type(screen.getByLabelText("Kode 6 digit"), "654321");

      await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
      // The code goes with the challenge the setup handed back.
      expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
        challenge: "fresh-challenge",
        code: "654321",
      });
    });
  });
});
