import { describe, expect, it } from "vitest";
import { buildShareUrl, parseEmbedContext } from "../share";

const context = {
  parentUrl: "https://resort.example/webcams?lang=en#old-section",
  iframeId: "camera-history-widget-acme-cam-1",
};

describe("parseEmbedContext", () => {
  it("accepts a valid parent context and strips nothing yet", () => {
    expect(parseEmbedContext({ type: "camera-history:context", ...context })).toEqual(context);
  });

  it("rejects missing, malformed or non-http contexts", () => {
    expect(parseEmbedContext(null)).toBeNull();
    expect(parseEmbedContext({})).toBeNull();
    expect(parseEmbedContext({ parentUrl: "javascript:alert(1)", iframeId: "x" })).toBeNull();
    expect(parseEmbedContext({ parentUrl: "https://example.com/", iframeId: "has space" })).toBeNull();
    expect(parseEmbedContext({ parentUrl: "not a url", iframeId: "x" })).toBeNull();
  });
});

describe("buildShareUrl", () => {
  it("uses the host page URL with a state and an iframe hash", () => {
    const url = new URL(
      buildShareUrl("https://camera.sengycraft.cz/widget/acme/cam-1", context, {
        date: "2026-10-18",
        hour: 14,
        cameraId: "cam-2",
      }),
    );
    expect(url.origin).toBe("https://resort.example");
    expect(url.pathname).toBe("/webcams");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("ch_target")).toBe(context.iframeId);
    expect(url.searchParams.get("ch_date")).toBe("2026-10-18");
    expect(url.searchParams.get("ch_hour")).toBe("14");
    expect(url.searchParams.get("ch_camera")).toBe("cam-2");
    expect(url.hash).toBe(`#${context.iframeId}`);
  });

  it("replaces stale state and omits the camera for single-camera widgets", () => {
    const url = new URL(
      buildShareUrl(
        "https://camera.sengycraft.cz/widget/acme/cam-1",
        {
          parentUrl:
            "https://resort.example/webcams?ch_date=2020-01-01&ch_camera=old&ch_target=old#old",
          iframeId: "camera-history-widget-acme-cam-1",
        },
        { date: "2026-10-18", hour: 9, cameraId: null },
      ),
    );
    expect(url.searchParams.get("ch_date")).toBe("2026-10-18");
    expect(url.searchParams.get("ch_hour")).toBe("9");
    expect(url.searchParams.get("ch_camera")).toBeNull();
    expect(url.searchParams.getAll("ch_target")).toEqual(["camera-history-widget-acme-cam-1"]);
    expect(url.searchParams.get("old")).toBeNull();
    expect(url.hash).toBe("#camera-history-widget-acme-cam-1");
  });

  it("falls back to the widget URL when there is no host context", () => {
    const url = new URL(
      buildShareUrl(
        "https://camera.sengycraft.cz/group/acme/summit?theme=dark",
        null,
        { date: "2026-10-17", hour: 18, cameraId: "cam-2" },
      ),
    );
    expect(url.origin).toBe("https://camera.sengycraft.cz");
    expect(url.pathname).toBe("/group/acme/summit");
    expect(url.searchParams.get("theme")).toBe("dark");
    expect(url.searchParams.get("date")).toBe("2026-10-17");
    expect(url.searchParams.get("hour")).toBe("18");
    expect(url.searchParams.get("camera")).toBe("cam-2");
    expect(url.hash).toBe("");
  });

  it("ignores an invalid context and falls back", () => {
    const url = new URL(
      buildShareUrl("https://camera.sengycraft.cz/widget/acme/cam-1", { parentUrl: "javascript:x", iframeId: "x" } as never, {
        date: "2026-10-17",
        hour: 18,
        cameraId: null,
      }),
    );
    expect(url.pathname).toBe("/widget/acme/cam-1");
    expect(url.searchParams.get("ch_target")).toBeNull();
    expect(url.searchParams.get("date")).toBe("2026-10-17");
  });
});
