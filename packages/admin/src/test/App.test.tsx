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

    await screen.findByTestId("logout");
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

describe("App dashboard", () => {
  const camera = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "cam-1",
    name: "Beach cam",
    feedType: "static_url",
    feedUrl: "https://placehold.co/600x400.jpg",
    intervalMinutes: 5,
    activeFrom: "00:00",
    activeTo: "23:59",
    timezone: "UTC",
    enabled: true,
    status: "delayed",
    lastCaptureAt: "2026-09-23T13:00:00.000Z",
    lastError: "feed returned HTTP 502",
    ...over,
  });

  it("lists cameras with status badges and preview url", async () => {
    const json: Array<{ fn: (u: string) => Response }> = [];
    const server = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/api/v1/admin/cameras")) {
        return jsonResponse({ cameras: [camera(), camera({ id: "cam-2", name: "Kite cam", status: "operational" })] });
      }
      if (u.includes("/preview")) {
        return jsonResponse({ latest: { id: "img-1", timestamp: "2026-09-23T13:00:00.000Z", url: `http://localhost:8080/${u.split("/").at(-2)}/2026-09-23/130000.jpg` } });
      }
      return jsonResponse({ detail: "not found" }, 404);
    });
    vi.stubGlobal("fetch", server);

    render(<App />);

    expect(await screen.findByText("Beach cam")).toBeInTheDocument();
    expect(screen.getByText("Kite cam")).toBeInTheDocument();
    expect(screen.getByTestId("status-cam-1")).toHaveTextContent("Zpožděno");
    expect(screen.getByTestId("status-cam-2")).toHaveTextContent("V běhu");
    expect(screen.getByTestId("last-error-cam-1")).toHaveTextContent("feed returned HTTP 502");
    const img = screen.getAllByRole("img")[0] as HTMLImageElement;
    expect(img.src).toContain("/2026-09-23/130000.jpg");
  });

  it("logs out back to the login screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith("/api/v1/admin/cameras")) return jsonResponse({ cameras: [camera()] });
        if (u.endsWith("/api/v1/auth/logout")) return jsonResponse({ status: "ok" });
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await screen.findByText("Beach cam");
    await userEvent.click(screen.getByTestId("logout"));
    await screen.findByTestId("login-form");
  });
});