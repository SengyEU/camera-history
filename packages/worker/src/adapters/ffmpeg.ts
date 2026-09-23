import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { HttpError } from "@ch/core";
import type { FetchJpegOptions } from "./staticUrl.js";

export interface FfmpegRunOptions extends FetchJpegOptions {
  spawn?: (command: string, args: string[], options: { stdio: "pipe"[] }) => ChildProcessWithoutNullStreams;
}

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);

export function runFfmpeg(args: string[], opts: FfmpegRunOptions): Promise<Buffer> {
  const spawn: FfmpegRunOptions["spawn"] = opts.spawn ?? ((command, argList, options) => nodeSpawn(command, argList, options));
  const child = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
  const chunks: Buffer[] = [];
  const stderr: string[] = [];
  let timedOut = false;

  const kill = () => {
    try {
      child.kill("SIGKILL");
    } catch {
      // already dead
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, opts.timeoutMs);

  return new Promise<Buffer>((resolve, reject) => {
    child.stdout.on("data", (d: Buffer) => {
      chunks.push(d);
      const total = chunks.reduce((n, c) => n + c.length, 0);
      if (total > opts.maxBytes) {
        kill();
        reject(new HttpError(502, "feed_too_large", `feed exceeded ${opts.maxBytes} bytes`));
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr.push(d.toString("utf8"));
    });
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(new HttpError(502, "ffmpeg_not_found", `ffmpeg failed: ${err.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new HttpError(502, "capture_timeout", "ffmpeg timed out"));
        return;
      }
      if (code !== 0) {
        reject(new HttpError(502, "ffmpeg_error", `ffmpeg exited ${code}: ${stderr.join("").trim().slice(-300)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      if (!buf.subarray(0, 3).equals(JPEG_HEADER)) {
        reject(new HttpError(502, "not_jpeg", "ffmpeg output is not a JPEG"));
        return;
      }
      resolve(buf);
    });
  });
}

export function captureHls(url: string, opts: FfmpegRunOptions): Promise<Buffer> {
  return runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", url, "-frames:v", "1", "-q:v", "2", "-f", "image2", "pipe:1"], opts);
}

export function captureRtsp(url: string, opts: FfmpegRunOptions): Promise<Buffer> {
  return runFfmpeg(["-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", url, "-frames:v", "1", "-q:v", "2", "-f", "image2", "pipe:1"], opts);
}
