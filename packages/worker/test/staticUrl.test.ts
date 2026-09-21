import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchJpeg } from "../src/adapters/staticUrl.js";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x00]);

let server: Server;
let baseUrl = "";

beforeEach(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", baseUrl);
    if (url.pathname === "/cam.jpg") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(JPG);
    } else if (url.pathname === "/big.jpg") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(Buffer.concat([JPG, Buffer.alloc(1000)]));
    } else if (url.pathname === "/text.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello");
    } else if (url.pathname === "/missing.jpg") {
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

describe("fetchJpeg", () => {
  it("fetches a valid JPEG", async () => {
    const buf = await fetchJpeg(`${baseUrl}/cam.jpg`, { timeoutMs: 2000, maxBytes: 1_000_000 });
    expect(buf).toEqual(JPG);
  });

  it("rejects oversized feeds", async () => {
    await expect(
      fetchJpeg(`${baseUrl}/big.jpg`, { timeoutMs: 2000, maxBytes: 5 }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects non-JPEG content", async () => {
    await expect(
      fetchJpeg(`${baseUrl}/text.txt`, { timeoutMs: 2000, maxBytes: 1_000_000 }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects 404 upstream", async () => {
    await expect(
      fetchJpeg(`${baseUrl}/missing.jpg`, { timeoutMs: 2000, maxBytes: 1_000_000 }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects non-http schemes", async () => {
    await expect(
      fetchJpeg("ftp://example.com/cam.jpg", { timeoutMs: 2000, maxBytes: 1_000_000 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});