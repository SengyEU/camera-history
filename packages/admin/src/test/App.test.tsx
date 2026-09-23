import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App login", () => {
  it("shows login and signs in", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
        const u = String(url);
        calls.push(u);
        if (u.endsWith("/api/v1/admin/cameras")) {
          return jsonResponse({ detail: "unauthorized" }, 401);
        }
        if (u.endsWith("/api/v1/auth/login")) {
          return jsonResponse({ status: "ok" });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await screen.findByTestId("login-form");

    await userEvent.type(screen.getByTestId("login-email"), "demo@example.dev");
    await userEvent.type(screen.getByTestId("login-password"), "demo-pass-123");
    await userEvent.click(screen.getByTestId("login-submit"));

    await screen.findByTestId("dashboard-placeholder");
    expect(calls.filter((c) => c.endsWith("/api/v1/auth/login"))).toHaveLength(1);
  });

  it("shows an error when login fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith("/api/v1/admin/cameras")) return jsonResponse({ detail: "unauthorized" }, 401);
        if (u.endsWith("/api/v1/auth/login")) return jsonResponse({ detail: "wrong credentials" }, 401);
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await screen.findByTestId("login-form");

    await userEvent.type(screen.getByTestId("login-email"), "a@b.cz");
    await userEvent.type(screen.getByTestId("login-password"), "bad");
    await userEvent.click(screen.getByTestId("login-submit"));

    await waitFor(() => expect(screen.getByTestId("login-error")).toHaveTextContent("wrong credentials"));
  });
});