import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureMjpeg } from "../src/adapters/mjpeg.js";

const FRAME = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0xff, 0xd9]);

function multipart(boundary: string, frame: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`),
    frame,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

function headers(boundary: string): { "Content-Type": string } {
  return { "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}` };
}

let server: Server;
let baseUrl = "";

beforeEach(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", baseUrl);
    if (url.pathname === "/multi.mjpg") {
      res.writeHead(200, headers("ffb"));
      const body = multipart("ffb", FRAME);
      res.write(body.subarray(0, 6)); // split across chunks
      setTimeout(() => res.write(body.subarray(6)), 5);
      setTimeout(() => res.end(), 10);
    } else if (url.pathname === "/slow.mjpg") {
      res.writeHead(200, headers("ffb"));
      res.write("no frame for you");
      // never send EOI
    } else if (url.pathname === "/big.mjpg") {
      res.writeHead(200, headers("ffb"));
      res.end(multipart("ffb", Buffer.concat([FRAME, Buffer.alloc(4096)])));
    } else if (url.pathname === "/text.mjpg") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello");
    } else if (url.pathname === "/missing.mjpg") {
      res.writeHead(404);
      res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("captureMjpeg", () => {
  it("extracts the first JPEG frame from a multipart stream (split across chunks)", async () => {
    const buf = await captureMjpeg(`${baseUrl}/multi.mjpg`, { timeoutMs: 2000, maxBytes: 1_000_000 });
    expect(buf).toEqual(FRAME);
  });

  it("rejects a stream without an end marker on timeout", async () => {
    await expect(captureMjpeg(`${baseUrl}/slow.mjpg`, { timeoutMs: 100, maxBytes: 1_000_000 })).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects oversized frames", async () => {
    await expect(
      captureMjpeg(`${baseUrl}/big.mjpg`, { timeoutMs: 2000, maxBytes: 50 }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects non-JPEG payload", async () => {
    await expect(
      captureMjpeg(`${baseUrl}/text.mjpg`, { timeoutMs: 2000, maxBytes: 1_000_000 }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects upstream errors and bad schemes", async () => {
    await expect(captureMjpeg(`${baseUrl}/missing.mjpg`, { timeoutMs: 2000, maxBytes: 1_000_000 })).rejects.toMatchObject({
      status: 502,
    });
    await expect(captureMjpeg("file:///etc/hostname", { timeoutMs: 2000, maxBytes: 1_000_000 })).rejects.toMatchObject({
      status: 400,
    });
  });
});