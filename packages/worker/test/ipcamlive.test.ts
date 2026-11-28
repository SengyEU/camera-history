import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureIpcamlive,
  clearIpcamliveCache,
  findIpcamliveSnapshot,
  ipcamliveAlias,
} from "../src/adapters/ipcamlive.js";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x00]);
const opts = { timeoutMs: 2000, maxBytes: 1_000_000 };

beforeEach(() => {
  clearIpcamliveCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IPCamlive alias parsing", () => {
  it("accepts an alias, a player URL and a widget URL", () => {
    expect(ipcamliveAlias("hotelpuntascario")).toBe("hotelpuntascario");
    expect(ipcamliveAlias("https://www.ipcamlive.com/hotelpuntascario")).toBe(
      "hotelpuntascario",
    );
    expect(
      ipcamliveAlias(
        "https://g0.ipcamlive.com/player/player.php?alias=hotelpuntascario&skin=white",
      ),
    ).toBe("hotelpuntascario");
  });

  it("rejects a snapshot URL instead of guessing from the stream id", () => {
    expect(() =>
      ipcamliveAlias("https://s76.ipcamlive.com/streams/abc123/snapshot.jpg"),
    ).toThrow(/player URL or alias/);
  });
});

describe("IPCamlive snapshot discovery", () => {
  it("finds a snapshot URL, including JSON-escaped slashes", () => {
    const html = `<div>https:\\/\\/s171.ipcamlive.com\\/streams\\/abri3lhzcym7ekgwx\\/snapshot.jpg</div>`;
    expect(findIpcamliveSnapshot(html)).toBe(
      "https://s171.ipcamlive.com/streams/abri3lhzcym7ekgwx/snapshot.jpg",
    );
  });

  it("returns null when the page has no snapshot", () => {
    expect(findIpcamliveSnapshot("<html>no camera here</html>")).toBeNull();
  });
});

describe("captureIpcamlive", () => {
  it("resolves the current shard and fetches the JPEG", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://www.ipcamlive.com/hotelpuntascario") {
        return new Response(
          '<div style="background-image:url(https://s76.ipcamlive.com/streams/abc123/snapshot.jpg)"></div>',
          { status: 200 },
        );
      }
      if (url === "https://s76.ipcamlive.com/streams/abc123/snapshot.jpg") {
        return new Response(JPG, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const buf = await captureIpcamlive("hotelpuntascario", opts);
    expect(buf).toEqual(JPG);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-resolves when the stream moved to another shard", async () => {
    let playerHits = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://www.ipcamlive.com/shard-test") {
        playerHits += 1;
        const shard = playerHits === 1 ? "s1" : "s2";
        return new Response(
          `<div>https://${shard}.ipcamlive.com/streams/abc123/snapshot.jpg</div>`,
          { status: 200 },
        );
      }
      if (url === "https://s1.ipcamlive.com/streams/abc123/snapshot.jpg") {
        return new Response("gone", { status: 404 });
      }
      if (url === "https://s2.ipcamlive.com/streams/abc123/snapshot.jpg") {
        return new Response(JPG, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const buf = await captureIpcamlive("shard-test", opts);
    expect(buf).toEqual(JPG);
    expect(playerHits).toBe(2);
  });

  it("fails clearly when the page exposes no snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>no camera</html>", { status: 200 })),
    );
    await expect(captureIpcamlive("no-snapshot", opts)).rejects.toMatchObject({
      status: 502,
      title: "ipcamlive_snapshot_missing",
    });
  });
});
