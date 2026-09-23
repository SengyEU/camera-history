import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { captureHls, captureRtsp } from "../src/adapters/ffmpeg.js";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01]);

function fakeFfmpeg(opts: { data?: Buffer; code?: number; stderr?: string; error?: Error }): ChildProcessWithoutNullStreams {
  const stdout = new EventEmitter() as unknown as ChildProcessWithoutNullStreams["stdout"];
  const stderr = new EventEmitter() as unknown as ChildProcessWithoutNullStreams["stderr"];
  const proc = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  Object.defineProperties(proc, {
    stdout: { value: stdout },
    stderr: { value: stderr },
    kill: { value: vi.fn() },
  });
  setTimeout(() => {
    if (opts.error) {
      proc.emit("error", opts.error);
      proc.emit("close", 1);
      return;
    }
    if (opts.data) stdout.emit("data", opts.data);
    stderr.emit("data", Buffer.from(opts.stderr ?? ""));
    proc.emit("close", opts.code ?? 0);
  }, 0);
  return proc;
}

const opts = (spawn: (cmd: string, args: string[]) => ChildProcessWithoutNullStreams) => ({
  timeoutMs: 1000,
  maxBytes: 1_000_000,
  spawn,
});

describe("captureHls", () => {
  it("runs ffmpeg and returns the JPEG body", async () => {
    const buf = await captureHls(
      "https://example.com/live.m3u8",
      opts(() => fakeFfmpeg({ data: JPG })),
    );
    expect(buf).toEqual(JPG);
  });

  it("passes -rtsp_transport tcp for rtsp", async () => {
    const spawn = (cmd: string, args: string[]) => {
      expect(cmd).toBe("ffmpeg");
      expect(args).toContain("-rtsp_transport");
      expect(args).toContain("tcp");
      expect(args.slice(args.indexOf("-i") + 1, args.indexOf("-i") + 2)).toEqual(["rtsp://cam/cam"]);
      return fakeFfmpeg({ data: JPG });
    };
    await captureRtsp("rtsp://cam/cam", opts(spawn));
  });

  it("rejects non-zero ffmpeg exit", async () => {
    await expect(captureHls("https://example.com/a.m3u8", opts(() => fakeFfmpeg({ code: 1, stderr: "bad stream\n" })))).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects when ffmpeg binary is missing", async () => {
    await expect(
      captureHls("https://example.com/a.m3u8", opts(() => fakeFfmpeg({ error: new Error("spawn ffmpeg ENOENT") }))),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects when output is not JPEG", async () => {
    await expect(
      captureHls("https://example.com/a.m3u8", opts(() => fakeFfmpeg({ data: Buffer.from("not a jpeg") }))),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("times out when ffmpeg stalls", async () => {
    await expect(
      captureHls("https://example.com/a.m3u8", { timeoutMs: 50, maxBytes: 1_000_000, spawn: () => fakeFfmpeg({}) }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
