/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type SeedGroup = { id: string; name: string; slug: string; cameraIds: string[] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window.navigator as { clipboard?: unknown }).clipboard;
  window.location.hash = "";
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

  it("toggles password visibility on the login screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith("/api/v1/admin/cameras")) return jsonResponse({ detail: "unauthorized" }, 401);
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await screen.findByTestId("login-form");
    const input = screen.getByTestId("login-password");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByTestId("login-password-toggle"));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByTestId("login-password-toggle")).toHaveTextContent("Hide");
    await userEvent.click(screen.getByTestId("login-password-toggle"));
    expect(input).toHaveAttribute("type", "password");
  });

  it("refreshes an expired session instead of logging out", async () => {
    let camerasCalls = 0;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        calls.push(u);
        if (u.endsWith("/api/v1/admin/cameras")) {
          camerasCalls += 1;
          return camerasCalls === 1
            ? jsonResponse({ detail: "invalid access token" }, 401)
            : jsonResponse({ cameras: [] });
        }
        if (u.endsWith("/api/v1/auth/refresh")) return jsonResponse({ status: "ok" });
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    expect(await screen.findByTestId("admin-app")).toBeInTheDocument();
    expect(screen.queryByTestId("login-form")).not.toBeInTheDocument();
    expect(calls.filter((u) => u.endsWith("/api/v1/auth/refresh"))).toHaveLength(1);
    expect(calls.filter((u) => u.endsWith("/api/v1/admin/cameras")).length).toBeGreaterThanOrEqual(2);
  });

  it("retries the initial session check after a transient API failure", async () => {
    let camerasCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith("/api/v1/admin/cameras")) {
          camerasCalls += 1;
          if (camerasCalls === 1) return jsonResponse({ detail: "bad gateway" }, 502);
          return jsonResponse({ cameras: [] });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    expect(await screen.findByTestId("admin-app", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(camerasCalls).toBeGreaterThanOrEqual(2);
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
    theme: "light",
    status: "delayed",
    lastCaptureAt: "2026-09-23T13:00:00.000Z",
    lastError: "feed returned HTTP 502",
    ...over,
  });

  it("lists cameras with status badges and preview url", async () => {
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
    expect(screen.getByTestId("status-cam-1")).toHaveTextContent("Delayed");
    expect(screen.getByTestId("status-cam-2")).toHaveTextContent("Operational");
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

describe("App camera CRUD", () => {
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
    theme: "light",
    status: "operational",
    lastCaptureAt: null,
    lastError: null,
    latitude: null,
    longitude: null,
    daylightOnly: false,
    showNight: true,
    ...over,
  });

  function listServer(seed: Partial<Record<string, unknown>> = {}) {
    const calls: Array<{ u: string; init?: RequestInit }> = [];
    let created: ReturnType<typeof camera> | null = null;
    const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ u, init });
      if (u.endsWith("/api/v1/admin/cameras") && (!init || init.method === "GET" || init.method === undefined)) {
        return jsonResponse({ cameras: created ? [camera(seed), created] : [camera(seed)] });
      }
      if (u.endsWith("/api/v1/admin/cameras") && init?.method === "POST") {
        created = camera({ id: "cam-new", name: "New cam" });
        return jsonResponse({ camera: created }, 201);
      }
      if (u.includes("/api/v1/admin/cameras/cam-1") && init?.method === "PUT") {
        return jsonResponse({ camera: camera({ name: "Renamed cam" }) });
      }
      if (u.includes("/api/v1/admin/cameras/cam-1") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (u.endsWith("/api/v1/admin/tenant")) {
        return jsonResponse({ tenant: { id: "t1", name: "Acme", slug: "acme", planMonths: 12 } });
      }
      return jsonResponse({ detail: "not found" }, 404);
    });
    return { fn, calls };
  }

  it("creates a camera through the form", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.type(screen.getByTestId("form-name"), "New cam");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() => expect(calls.some((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toBe(true));
    const post = calls.find((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")!;
    const body = JSON.parse(String(post.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ name: "New cam", feedType: "static_url", theme: "light" });
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
    expect(await screen.findByTestId("camera-saved")).toHaveTextContent("Saved");
    expect(screen.getByTestId("camera-editor")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/cameras/cam-new");
  });

  it("creates a camera with a selected theme", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.selectOptions(screen.getByTestId("form-theme"), "forest");
    await userEvent.type(screen.getByTestId("form-name"), "Forest cam");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() => expect(calls.some((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toBe(true));
    const post = calls.find((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init?.body))).toMatchObject({ name: "Forest cam", theme: "forest" });
  });

  it("renames a camera through the edit form", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    const nameInput = screen.getByTestId("form-name") as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed cam");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() => expect(calls.some((c) => c.u.includes("/cam-1") && c.init?.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT")!;
    expect(JSON.parse(String(put.init?.body))).toMatchObject({ name: "Renamed cam", showNight: true });
    expect(await screen.findByTestId("camera-saved")).toHaveTextContent("Saved");
    expect(screen.getByTestId("camera-editor")).toBeInTheDocument();
  });

  it("shows per-camera statistics and a fleet summary", async () => {
    const { fn } = listServer({
      imageCount: 120,
      totalBytes: 1_500_000,
      planMonths: 3,
      firstCaptureAt: "2026-09-20T12:00:00.000Z",
      lastCaptureAt: "2026-09-23T13:00:00.000Z",
    });
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    expect(screen.getByTestId("camera-images-cam-1")).toHaveTextContent("120");
    expect(screen.getByTestId("camera-plan-cam-1")).toHaveTextContent("3 months");
    expect(screen.getByTestId("camera-running-cam-1")).not.toHaveTextContent("—");
    expect(screen.getByTestId("summary-images")).toHaveTextContent("120");
    expect(screen.getByTestId("summary-since")).toHaveTextContent(/2026/);
    expect(screen.queryByTestId("camera-bytes-cam-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("summary-bytes")).not.toBeInTheDocument();
  });

  it("opens the camera editor as a separate page with a back link", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");
    expect(screen.getByTestId("camera-summary")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    expect(screen.getByTestId("camera-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("camera-summary")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("form-back"));
    expect(screen.getByTestId("camera-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("camera-editor")).not.toBeInTheDocument();
  });

  it("configures a custom theme and warns about low contrast", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.selectOptions(screen.getByTestId("form-theme"), "custom");
    expect(screen.getByTestId("custom-theme-fields")).toBeInTheDocument();
    expect(screen.getByTestId("form-color-bg")).toHaveValue("#f8fafb");

    fireEvent.change(screen.getByTestId("form-color-ink"), { target: { value: "#ffffff" } });
    expect(screen.getByTestId("contrast-warnings")).toHaveTextContent("Text on background");

    await userEvent.type(screen.getByTestId("form-name"), "Custom cam");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toBe(true),
    );
    const post = calls.find((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")!;
    const body = JSON.parse(String(post.init?.body)) as {
      theme: string;
      themeColors: Record<string, string>;
    };
    expect(body.theme).toBe("custom");
    expect(body.themeColors.ink).toBe("#ffffff");
    expect(body.themeColors.bg).toBe("#f8fafb");
  });

  it("saves theme changes automatically without pressing save", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    await userEvent.selectOptions(screen.getByTestId("form-theme"), "custom");

    await waitFor(
      () =>
        expect(
          calls.some(
            (c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT",
          ),
        ).toBe(true),
      { timeout: 2500 },
    );
    const put = calls.find(
      (c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT",
    )!;
    const body = JSON.parse(String(put.init?.body)) as {
      theme: string;
      themeColors: Record<string, string>;
    };
    expect(body.theme).toBe("custom");
    expect(body.themeColors.bg).toBe("#f8fafb");
    expect(await screen.findByTestId("theme-save-state")).toHaveTextContent("Theme saved");
  });

  it("reflects the open camera in the URL and returns to the list from the Cameras tab", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    expect(window.location.hash).toBe("#/cameras/cam-1");
    expect(screen.getByTestId("camera-editor")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("nav-groups"));
    await waitFor(() => expect(screen.queryByTestId("camera-editor")).not.toBeInTheDocument());

    await userEvent.click(screen.getByTestId("nav-cameras"));
    await screen.findByTestId("camera-summary");
    expect(screen.queryByTestId("camera-editor")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#/cameras");
  });

  it("shows the inherited account plan on a camera card", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");
    expect(screen.getByTestId("camera-plan-cam-1")).toHaveTextContent("Account (12 months)");
  });

  it("shows and saves a per-camera plan", async () => {
    const { fn, calls } = listServer({ planMonths: 3 });
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    expect(screen.getByTestId("camera-plan-card")).toBeInTheDocument();
    expect(screen.getByTestId("camera-plan-card").closest(".camera-preview")).not.toBeNull();
    expect(screen.getByTestId("camera-plan-current")).toHaveTextContent("3 months");
    const plan = screen.getByTestId("form-plan") as HTMLSelectElement;
    expect(plan.value).toBe("3");
    expect(plan).toHaveTextContent("Inherit from account (12 months)");
    expect(plan).toHaveTextContent("6 months");

    await userEvent.selectOptions(plan, "6");
    expect(screen.getByTestId("camera-plan-current")).toHaveTextContent("6 months");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT")).toBe(true),
    );
    const put = calls.find(
      (c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT",
    )!;
    expect(JSON.parse(String(put.init?.body))).toMatchObject({ planMonths: 6 });
    expect(await screen.findByTestId("camera-saved")).toHaveTextContent("Saved");
    expect(screen.getByTestId("camera-editor")).toBeInTheDocument();
  });

  it("clears a per-camera plan back to inherit", async () => {
    const { fn, calls } = listServer({ planMonths: 6 });
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    await userEvent.selectOptions(screen.getByTestId("form-plan"), "");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT")).toBe(true),
    );
    const put = calls.find(
      (c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT",
    )!;
    expect(JSON.parse(String(put.init?.body))).toMatchObject({ planMonths: null });
    expect(await screen.findByTestId("camera-saved")).toHaveTextContent("Saved");
    expect(screen.getByTestId("camera-editor")).toBeInTheDocument();
  });

  it("saves the camera time format", async () => {
    const { fn, calls } = listServer({ timeFormat: "12h" });
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    const format = screen.getByTestId("form-time-format") as HTMLSelectElement;
    expect(format.value).toBe("12h");
    await userEvent.selectOptions(format, "24h");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT")).toBe(true),
    );
    const put = calls.find(
      (c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT",
    )!;
    expect(JSON.parse(String(put.init?.body))).toMatchObject({ timeFormat: "24h" });
  });

  it("shows a live widget preview beside the camera settings", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    const preview = await screen.findByTestId("camera-preview");
    expect(preview.getAttribute("src")).toContain("/widget/acme/cam-1");
    expect(preview.getAttribute("src")).toContain("theme=light");

    await userEvent.selectOptions(screen.getByTestId("form-theme"), "forest");
    await waitFor(() =>
      expect(screen.getByTestId("camera-preview").getAttribute("src")).toContain("theme=forest"),
    );
  });

  it("copies an embed snippet for an individual camera", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("embed-cam-1"));

    expect(writeText).toHaveBeenCalledTimes(1);
    const snippet = writeText.mock.calls[0]![0];
    expect(snippet).toContain(`${window.location.origin}/embed.js`);
    expect(snippet).toContain("/widget/acme/cam-1");
    expect(snippet).toContain('id="camera-history-widget-acme-cam-1"');
    expect(snippet).toContain('title="Beach cam — Camera History"');
    expect(snippet).toContain('loading="lazy"');
    expect(await screen.findByTestId("embed-copied-cam-1")).toHaveTextContent("Copied");
  });

  it("shows and copies the camera embed code in the editor", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));

    expect(await screen.findByTestId("camera-embed")).toHaveTextContent("/widget/acme/cam-1");
    expect(screen.getByTestId("camera-embed-hint")).toHaveTextContent(
      "#camera-history-widget-acme-cam-1",
    );

    await userEvent.click(screen.getByTestId("camera-embed-copy"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('id="camera-history-widget-acme-cam-1"'),
    );
    expect(await screen.findByTestId("camera-embed-copied")).toHaveTextContent("Copied");
  });

  it("deletes a camera", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("delete-cam-1"));
    await screen.findByTestId("confirm-delete");
    await userEvent.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => expect(calls.some((c) => c.u.includes("/cam-1") && c.init?.method === "DELETE")).toBe(true));
  });

  it("renders location and daylight fields in the camera form", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));

    const latitude = screen.getByTestId("form-latitude") as HTMLInputElement;
    const longitude = screen.getByTestId("form-longitude") as HTMLInputElement;
    const daylight = screen.getByTestId("form-daylight-only") as HTMLInputElement;
    expect(latitude).toHaveAttribute("type", "number");
    expect(longitude).toHaveAttribute("type", "number");
    expect(daylight).toHaveAttribute("type", "checkbox");
    expect(daylight).not.toBeChecked();
    expect(screen.getByTestId("form-daylight-state")).toHaveTextContent("24-hour capture");
    expect(screen.getByText("Used to filter day/night images")).toBeInTheDocument();
    expect(
      screen.getByText("Requires latitude and longitude. The camera's active window is ignored while enabled."),
    ).toBeInTheDocument();
  });

  it("renders the show-night checkbox in the camera form", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));

    const showNight = screen.getByTestId("form-show-night") as HTMLInputElement;
    expect(showNight).toHaveAttribute("type", "checkbox");
    expect(showNight).not.toBeChecked();
    expect(screen.getByLabelText("Show night images")).toBe(showNight);
    expect(
      screen.getByText("Night images are shown in the widget only when this is enabled."),
    ).toBeInTheDocument();
  });

  it("creates a camera with showNight enabled", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.type(screen.getByTestId("form-name"), "Night cam");
    await userEvent.click(screen.getByTestId("form-show-night"));
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toBe(true),
    );
    const post = calls.find((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init?.body))).toMatchObject({ name: "Night cam", showNight: true });
  });

  it("sends showNight false when the checkbox is left unchecked", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.type(screen.getByTestId("form-name"), "Day cam");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toBe(true),
    );
    const post = calls.find((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")!;
    const body = JSON.parse(String(post.init?.body)) as Record<string, unknown>;
    expect(body.showNight).toBe(false);
  });

  it("creates a camera with coordinates and daylight-only enabled", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.type(screen.getByTestId("form-name"), "New cam");
    await userEvent.type(screen.getByTestId("form-latitude"), "47.376");
    await userEvent.type(screen.getByTestId("form-longitude"), "8.541");
    await userEvent.click(screen.getByTestId("form-daylight-only"));
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toBe(true),
    );
    const post = calls.find((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init?.body))).toMatchObject({
      name: "New cam",
      latitude: 47.376,
      longitude: 8.541,
      daylightOnly: true,
    });
  });

  it("requires coordinates when daylight-only is enabled", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.type(screen.getByTestId("form-name"), "New cam");
    await userEvent.click(screen.getByTestId("form-daylight-only"));
    await userEvent.click(screen.getByTestId("form-submit"));

    expect(
      await screen.findByText("Latitude and longitude are required to capture only during daylight."),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toHaveLength(0);
  });

  it("rejects out-of-range latitude without submitting", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.type(screen.getByTestId("form-name"), "New cam");
    await userEvent.type(screen.getByTestId("form-latitude"), "120");
    await userEvent.click(screen.getByTestId("form-submit"));

    expect(await screen.findByText("Latitude must be between -90 and 90.")).toBeInTheDocument();
    expect(calls.filter((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toHaveLength(0);
  });

  it("prefills location fields when editing a camera", async () => {
    const { fn } = listServer({ latitude: 47.376, longitude: 8.541, daylightOnly: true });
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));

    expect((screen.getByTestId("form-latitude") as HTMLInputElement).value).toBe("47.376");
    expect((screen.getByTestId("form-longitude") as HTMLInputElement).value).toBe("8.541");
    expect(screen.getByTestId("form-daylight-only")).toBeChecked();
  });

  it("prefills showNight when editing a camera", async () => {
    const { fn } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));

    expect(screen.getByTestId("form-show-night")).toBeChecked();
  });

  it("clears coordinates and disables daylight-only when editing", async () => {
    const { fn, calls } = listServer({ latitude: 47.376, longitude: 8.541, daylightOnly: true });
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("edit-cam-1"));
    await userEvent.click(screen.getByTestId("form-daylight-only"));
    await userEvent.clear(screen.getByTestId("form-latitude"));
    await userEvent.clear(screen.getByTestId("form-longitude"));
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT")).toBe(true),
    );
    const put = calls.find((c) => c.u.includes("/api/v1/admin/cameras/cam-1") && c.init?.method === "PUT")!;
    const body = JSON.parse(String(put.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ latitude: null, longitude: null, daylightOnly: false });
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
  });
});

describe("App registration", () => {
  const registerServer = (registerStatus = 201, detail = "tenant slug already taken") =>
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/api/v1/admin/cameras")) return jsonResponse({ detail: "unauthorized" }, 401);
      if (u.endsWith("/api/v1/auth/logout")) return jsonResponse({ status: "ok" });
      if (u.endsWith("/api/v1/auth/register")) {
        if (registerStatus !== 201) return jsonResponse({ detail }, registerStatus);
        return jsonResponse({ status: "created", tenantId: "t1", billing: { required: false } }, 201);
      }
      return jsonResponse({ detail: "not found" }, 404);
    });

  it("registers and lands on the empty camera list", async () => {
    vi.stubGlobal("fetch", registerServer());
    window.location.hash = "#/register";
    render(<App />);

    await screen.findByTestId("register-form");
    await userEvent.type(screen.getByTestId("register-name"), "Alpine Resort");
    await userEvent.type(screen.getByTestId("register-email"), "owner@alpine.dev");
    await userEvent.type(screen.getByTestId("register-password"), "supersecret");
    expect((screen.getByTestId("register-slug") as HTMLInputElement).value).toBe("alpine-resort");
    await userEvent.click(screen.getByTestId("register-submit"));

    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    window.location.hash = "";
  });

  it("shows an inline error when the slug is taken", async () => {
    vi.stubGlobal("fetch", registerServer(409));
    window.location.hash = "#/register";
    render(<App />);

    await screen.findByTestId("register-form");
    await userEvent.type(screen.getByTestId("register-name"), "Taken Co");
    await userEvent.type(screen.getByTestId("register-email"), "a@b.dev");
    await userEvent.type(screen.getByTestId("register-password"), "supersecret");
    await userEvent.click(screen.getByTestId("register-submit"));

    await waitFor(() => expect(screen.getByTestId("register-error")).toHaveTextContent("tenant slug already taken"));
    window.location.hash = "";
  });

  it("links from login to the register screen", async () => {
    vi.stubGlobal("fetch", registerServer());
    window.location.hash = "";
    render(<App />);
    await screen.findByTestId("login-form");
    await userEvent.click(screen.getByTestId("goto-register"));
    expect(window.location.hash).toBe("#/register");
    window.location.hash = "";
  });

  it("returns to login (not register) after registering then logging out", async () => {
    vi.stubGlobal("fetch", registerServer());
    window.location.hash = "#/register";
    render(<App />);

    await screen.findByTestId("register-form");
    await userEvent.type(screen.getByTestId("register-name"), "Alpine Resort");
    await userEvent.type(screen.getByTestId("register-email"), "owner@alpine.dev");
    await userEvent.type(screen.getByTestId("register-password"), "supersecret");
    await userEvent.click(screen.getByTestId("register-submit"));

    await screen.findByTestId("logout");
    expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("logout"));

    await screen.findByTestId("login-form");
    expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
    window.location.hash = "";
  });
});

describe("App groups", () => {
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
    theme: "light",
    status: "operational",
    lastCaptureAt: null,
    lastError: null,
    ...over,
  });

  const seedGroup = (over: Partial<SeedGroup> = {}): SeedGroup => ({
    id: "grp-1",
    name: "Summit",
    slug: "summit",
    cameraIds: [],
    ...over,
  });

  function groupServer(initialGroups: SeedGroup[] = [], tenantSlug = "acme") {
    const state: { groups: SeedGroup[] } = {
      groups: initialGroups.map((g) => ({ ...g, cameraIds: [...g.cameraIds] })),
    };
    const calls: Array<{ u: string; init?: RequestInit }> = [];
    const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      calls.push({ u, init });
      if (u.endsWith("/api/v1/admin/cameras") && method === "GET") {
        return jsonResponse({ cameras: [camera(), camera({ id: "cam-2", name: "Ridge cam" })] });
      }
      if (u.endsWith("/api/v1/admin/cameras") && method === "POST") {
        return jsonResponse({ camera: camera({ id: "cam-new", name: "New cam" }) }, 201);
      }
      if (u.includes("/preview")) return jsonResponse({ latest: null });
      if (u.endsWith("/api/v1/admin/tenant")) {
        return jsonResponse({ tenant: { id: "t1", name: "Acme", slug: tenantSlug, planMonths: 12 } });
      }
      if (u.endsWith("/api/v1/admin/groups") && method === "GET") {
        return jsonResponse({ groups: state.groups });
      }
      if (u.endsWith("/api/v1/admin/groups") && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { name: string; slug: string };
        const group: SeedGroup = { id: `grp-${state.groups.length + 1}`, ...body, cameraIds: [] };
        state.groups.push(group);
        return jsonResponse({ group }, 201);
      }
      const memberMatch = u.match(/\/api\/v1\/admin\/groups\/([^/]+)\/cameras$/);
      if (memberMatch && method === "PUT") {
        const body = JSON.parse(String(init?.body)) as { cameraIds: string[] };
        const target = state.groups.find((g) => g.id === memberMatch[1]);
        if (target) target.cameraIds = body.cameraIds;
        return jsonResponse({ status: "ok" });
      }
      const idMatch = u.match(/\/api\/v1\/admin\/groups\/([^/]+)$/);
      if (idMatch && method === "PATCH") {
        const body = JSON.parse(String(init?.body)) as { name?: string; slug?: string };
        const target = state.groups.find((g) => g.id === idMatch[1]);
        if (target) Object.assign(target, body);
        return jsonResponse({ group: target });
      }
      if (idMatch && method === "DELETE") {
        state.groups = state.groups.filter((g) => g.id !== idMatch[1]);
        return jsonResponse({ status: "ok" });
      }
      return jsonResponse({ detail: "not found" }, 404);
    });
    return { fn, calls, state };
  }

  async function openGroups() {
    render(<App />);
    await screen.findByText("Beach cam");
    await userEvent.click(screen.getByTestId("nav-groups"));
    await screen.findByTestId("groups-view");
  }

  it("shows an ordered group overview with camera chips", async () => {
    const { fn } = groupServer([seedGroup({ cameraIds: ["cam-2", "cam-1"] })]);
    vi.stubGlobal("fetch", fn);
    await openGroups();

    const card = screen.getByTestId("group-grp-1");
    expect(card).toHaveTextContent("Summit");
    expect(screen.getByTestId("group-count-grp-1")).toHaveTextContent("2 cameras");
    const chips = screen.getByTestId("group-cameras-grp-1").querySelectorAll(".camera-chip");
    expect(Array.from(chips).map((chip) => chip.textContent)).toEqual([
      "1Ridge cam",
      "2Beach cam",
    ]);
    expect(screen.getByTestId("add-group")).toBeInTheDocument();
    expect(screen.queryByTestId("group-form")).not.toBeInTheDocument();
  });

  it("creates a group in the two-column editor with ordered cameras", async () => {
    const { fn, calls } = groupServer([], "acme");
    vi.stubGlobal("fetch", fn);
    await openGroups();

    await userEvent.click(screen.getByTestId("add-group"));
    expect(await screen.findByTestId("group-editor")).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("group-name"), "Summit Ridge");
    expect((screen.getByTestId("group-slug") as HTMLInputElement).value).toBe("summit-ridge");

    await userEvent.click(screen.getByTestId("group-camera-add-cam-2"));
    await userEvent.click(screen.getByTestId("group-camera-add-cam-1"));
    const rows = screen.getAllByTestId(/^group-camera-(?!add|remove|drag)/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "group-camera-cam-2",
      "group-camera-cam-1",
    ]);

    await userEvent.click(screen.getByTestId("group-save"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.endsWith("/api/v1/admin/groups") && c.init?.method === "POST")).toBe(true),
    );
    const post = calls.find((c) => c.u.endsWith("/api/v1/admin/groups") && c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ name: "Summit Ridge", slug: "summit-ridge" });
    await waitFor(() =>
      expect(calls.some((c) => c.u.endsWith("/api/v1/admin/groups/grp-1/cameras") && c.init?.method === "PUT")).toBe(true),
    );
    const put = calls.find(
      (c) => c.u.endsWith("/api/v1/admin/groups/grp-1/cameras") && c.init?.method === "PUT",
    )!;
    expect(JSON.parse(String(put.init?.body))).toEqual({ cameraIds: ["cam-2", "cam-1"] });
    expect(await screen.findByTestId("group-saved")).toHaveTextContent("Saved");
    expect(screen.getByTestId("group-editor")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/groups/grp-1");
    expect(await screen.findByTestId("group-embed-code")).toHaveTextContent("/group/acme/summit-ridge");
  });

  it("edits group fields and membership", async () => {
    const { fn, calls } = groupServer([seedGroup({ cameraIds: ["cam-2", "cam-1"] })]);
    vi.stubGlobal("fetch", fn);
    await openGroups();

    await userEvent.click(screen.getByTestId("group-edit-grp-1"));
    await screen.findByTestId("group-editor");
    const name = screen.getByTestId("group-name") as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, "Summit Ridge");
    await userEvent.click(screen.getByTestId("group-camera-remove-cam-2"));
    await userEvent.click(screen.getByTestId("group-save"));

    await waitFor(() =>
      expect(calls.some((c) => c.u.endsWith("/api/v1/admin/groups/grp-1") && c.init?.method === "PATCH")).toBe(true),
    );
    const patch = calls.find((c) => c.u.endsWith("/api/v1/admin/groups/grp-1") && c.init?.method === "PATCH")!;
    expect(JSON.parse(String(patch.init?.body))).toEqual({ name: "Summit Ridge", slug: "summit" });
    const put = calls.find(
      (c) => c.u.endsWith("/api/v1/admin/groups/grp-1/cameras") && c.init?.method === "PUT",
    )!;
    expect(JSON.parse(String(put.init?.body))).toEqual({ cameraIds: ["cam-1"] });
    expect(await screen.findByTestId("group-saved")).toHaveTextContent("Saved");
    expect(screen.getByTestId("group-editor")).toBeInTheDocument();
    expect(await screen.findByTestId("group-embed-code")).toHaveTextContent("/group/acme/summit");
    expect(window.location.hash).toBe("#/groups/grp-1");
  });

  it("renders sortable camera handles and preserves the saved order", async () => {
    const { fn } = groupServer([seedGroup({ cameraIds: ["cam-2", "cam-1"] })]);
    vi.stubGlobal("fetch", fn);
    await openGroups();
    await userEvent.click(screen.getByTestId("group-edit-grp-1"));
    await screen.findByTestId("group-editor");

    expect(screen.getByTestId("group-camera-drag-cam-2")).toBeInTheDocument();
    expect(screen.getByTestId("group-camera-drag-cam-1")).toBeInTheDocument();
    const rows = screen.getAllByTestId(/^group-camera-(?!add|remove|drag)/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "group-camera-cam-2",
      "group-camera-cam-1",
    ]);
  });

  it("shows the embed code and copies it in the group editor", async () => {
    const { fn } = groupServer([seedGroup({ cameraIds: ["cam-1"] })]);
    vi.stubGlobal("fetch", fn);
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    await openGroups();
    await userEvent.click(screen.getByTestId("group-edit-grp-1"));
    await screen.findByTestId("group-editor");

    expect(screen.getByTestId("group-embed-code")).toHaveTextContent("/group/acme/summit");
    expect(screen.getByTestId("group-embed-code")).toHaveTextContent(
      'id="camera-history-group-acme-summit"',
    );
    expect(screen.getByTestId("group-embed-code")).toHaveTextContent(
      'title="Summit — Camera History"',
    );
    expect(screen.getByTestId("group-embed-code-hint")).toHaveTextContent(
      "#camera-history-group-acme-summit",
    );

    await userEvent.click(screen.getByTestId("group-embed-code-copy"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('id="camera-history-group-acme-summit"'),
    );
    expect(await screen.findByTestId("group-embed-code-copied")).toHaveTextContent("Copied");
  });

  it("does not render embed code when the tenant fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? "GET";
        if (u.endsWith("/api/v1/admin/cameras") && method === "GET") {
          return jsonResponse({ cameras: [camera()] });
        }
        if (u.endsWith("/api/v1/admin/tenant")) return jsonResponse({ detail: "failed" }, 500);
        if (u.endsWith("/api/v1/admin/groups") && method === "GET") {
          return jsonResponse({ groups: [seedGroup({ cameraIds: ["cam-1"] })] });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );
    await openGroups();
    await userEvent.click(screen.getByTestId("group-edit-grp-1"));
    await screen.findByTestId("group-editor");
    expect(screen.queryByTestId("group-embed-code")).not.toBeInTheDocument();
    expect(screen.getByText("Save the group to get its embed code.")).toBeInTheDocument();
  });

  it("returns to the overview from the group editor", async () => {
    const { fn } = groupServer([seedGroup()]);
    vi.stubGlobal("fetch", fn);
    await openGroups();
    await userEvent.click(screen.getByTestId("group-edit-grp-1"));
    await screen.findByTestId("group-editor");
    expect(window.location.hash).toBe("#/groups/grp-1");

    await userEvent.click(screen.getByTestId("nav-groups"));
    await screen.findByTestId("groups-view");
    expect(screen.queryByTestId("group-editor")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#/groups");
  });

  it("renames and deletes a group from the overview", async () => {
    const { fn, calls } = groupServer([seedGroup()]);
    vi.stubGlobal("fetch", fn);
    await openGroups();

    await userEvent.click(screen.getByTestId("group-delete-grp-1"));
    await screen.findByText(/Delete group "Summit"\? Cameras stay/);
    await userEvent.click(screen.getByTestId("confirm-delete-group"));
    await waitFor(() =>
      expect(calls.some((c) => c.u.endsWith("/api/v1/admin/groups/grp-1") && c.init?.method === "DELETE")).toBe(true),
    );
    expect(screen.queryByTestId("group-grp-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirm-delete-group")).not.toBeInTheDocument();
    window.location.hash = "";
  });

  it("shows group not found for an unknown route", async () => {
    const { fn } = groupServer([seedGroup()]);
    vi.stubGlobal("fetch", fn);
    window.location.hash = "#/groups/missing";
    render(<App />);
    await screen.findByTestId("admin-app");
    expect(await screen.findByText("Group not found")).toBeInTheDocument();
    window.location.hash = "";
  });
});
