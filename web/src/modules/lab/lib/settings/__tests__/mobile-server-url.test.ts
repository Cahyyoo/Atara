import { describe, expect, it, vi } from "vitest";
import { checkMobileServerUrl, normaliseMobileServerUrl } from "@/modules/lab/lib/settings/mobile-server-url";

describe("normaliseMobileServerUrl", () => {
  it("keeps a plain LAN address", () => {
    expect(normaliseMobileServerUrl("http://10.10.50.14:3000/api")).toBe("http://10.10.50.14:3000/api");
  });

  it("trims space and a trailing slash, and lowercases the host", () => {
    expect(normaliseMobileServerUrl("  https://Lab.Example.com/api/ ")).toBe("https://lab.example.com/api");
  });

  it("keeps a reverse-proxy base path", () => {
    expect(normaliseMobileServerUrl("http://192.168.1.5/atara/api")).toBe("http://192.168.1.5/atara/api");
  });

  it("empty means the app's built-in address", () => {
    expect(normaliseMobileServerUrl("   ")).toBe("");
  });

  it.each([
    ["not a URL", "10.10.50.14:3000/api"],
    ["another scheme", "ftp://10.10.50.14/api"],
    ["not the API root", "http://10.10.50.14:3000"],
    ["a page rather than the API", "http://10.10.50.14:3000/lab/settings"],
    ["credentials", "http://admin:pw@10.10.50.14/api"],
    ["a query", "http://10.10.50.14/api?x=1"],
  ])("refuses %s", (_, input) => {
    expect(normaliseMobileServerUrl(input)).toBeNull();
  });
});

describe("checkMobileServerUrl", () => {
  const answer = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("accepts an address that answers with this server's id", async () => {
    const fetchImpl = answer({ success: true, data: { serverUrl: "", serverId: "lab-1" } });
    expect(await checkMobileServerUrl("http://10.0.0.2:3000/api", "lab-1", fetchImpl)).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledWith("http://10.0.0.2:3000/api/mobile-config", expect.anything());
  });

  it("refuses another Atara installation", async () => {
    const fetchImpl = answer({ success: true, data: { serverUrl: "", serverId: "lab-2" } });
    expect(await checkMobileServerUrl("http://10.0.0.2:3000/api", "lab-1", fetchImpl)).toBe("otherServer");
  });

  it("refuses something that is not the Atara API", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 404 })) as unknown as typeof fetch;
    expect(await checkMobileServerUrl("http://10.0.0.2/api", "lab-1", fetchImpl)).toBe("otherServer");
  });

  it("an address nothing answers at is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await checkMobileServerUrl("http://10.0.0.9/api", "lab-1", fetchImpl)).toBe("unreachable");
  });
});
