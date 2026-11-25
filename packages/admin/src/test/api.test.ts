/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api request headers", () => {
  it("does not send a JSON content type on bodyless posts", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await api.logout();
    await api.billingPortal();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.body).toBeUndefined();
      expect(new Headers(init.headers).has("content-type")).toBe(false);
    }
  });

  it("sends a JSON content type when the request has a body", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await api.login("owner@example.com", "secret");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBeTypeOf("string");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });
});
