import { describe, expect, it } from "vitest";
import { captureCustom } from "../src/adapters/custom.js";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01]);

class FakeWS {
  static instances: FakeWS[] = [];
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public readonly url: string) {
    FakeWS.instances.push(this);
  }
  close = () => undefined;
  send = () => undefined;
  open() {
    this.onopen?.();
  }
  frame(data: ArrayBuffer) {
    this.onmessage?.({ data });
  }
}

const ctor = FakeWS as unknown as typeof WebSocket;

describe("captureCustom", () => {
  it("returns the first websocket frame as JPEG", async () => {
    const p = captureCustom("wss://cam.kitesportcentre.com/gl-cam", {
      timeoutMs: 1000,
      maxBytes: 1_000_000,
      WebSocketCtor: ctor,
    });
    const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
    const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    ws.frame(toArrayBuffer(JPG));
    await expect(p).resolves.toEqual(JPG);
    expect(ws.binaryType).toBe("arraybuffer");
  });

  it("sets binaryType arraybuffer", () => {
    void captureCustom("wss://cam/x", { timeoutMs: 1000, maxBytes: 1_000_000, WebSocketCtor: ctor });
    expect(FakeWS.instances[FakeWS.instances.length - 1]!.binaryType).toBe("arraybuffer");
  });

  it("rejects on websocket error", async () => {
    const p = captureCustom("wss://cam/x", { timeoutMs: 1000, maxBytes: 1_000_000, WebSocketCtor: ctor });
    FakeWS.instances[FakeWS.instances.length - 1]!.onerror?.();
    await expect(p).rejects.toMatchObject({ status: 502 });
  });

  it("rejects a non-JPEG frame", async () => {
    const p = captureCustom("wss://cam/x", { timeoutMs: 1000, maxBytes: 1_000_000, WebSocketCtor: ctor });
    const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
    ws.frame(new TextEncoder().encode("hello").buffer as ArrayBuffer);
    await expect(p).rejects.toMatchObject({ status: 502 });
  });

  it("times out when no frame arrives", async () => {
    await expect(
      captureCustom("wss://cam/x", { timeoutMs: 50, maxBytes: 1_000_000, WebSocketCtor: ctor }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects bad schemes", async () => {
    await expect(
      captureCustom("https://cam/x", { timeoutMs: 50, maxBytes: 1_000_000, WebSocketCtor: ctor }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
