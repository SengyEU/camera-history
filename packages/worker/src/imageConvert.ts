import { spawn } from "node:child_process";

export const WEBP_ARGS = [
  "-hide_banner", "-loglevel", "error",
  "-i", "pipe:0",
  "-vf", "scale='min(1600,iw)':-2",
  "-c:v", "libwebp", "-quality", "75",
  "-f", "webp", "pipe:1",
];

export function toWebp(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", WEBP_ARGS);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`ffmpeg webp failed (${code}): ${Buffer.concat(err).toString().slice(0, 500)}`)),
    );
    proc.stdin.end(input);
  });
}
