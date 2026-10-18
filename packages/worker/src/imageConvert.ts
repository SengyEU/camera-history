import { spawn } from "node:child_process";

export const WEBP_ARGS = [
  "-hide_banner", "-loglevel", "error",
  "-i", "pipe:0",
  "-vf", "scale='min(1600,iw)':-2",
  "-c:v", "libwebp", "-quality", "75",
  "-f", "webp", "pipe:1",
];

const WEBP_TIMEOUT_MS = 30_000;

export function toWebp(input: Buffer, timeoutMs = WEBP_TIMEOUT_MS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", WEBP_ARGS);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // already dead
      }
      finish(() => reject(new Error(`ffmpeg webp timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", (e) => finish(() => reject(e)));
    proc.on("close", (code) =>
      finish(() =>
        code === 0
          ? resolve(Buffer.concat(out))
          : reject(new Error(`ffmpeg webp failed (${code}): ${Buffer.concat(err).toString().slice(0, 500)}`)),
      ),
    );
    proc.stdin.on("error", () => {});
    proc.stdin.end(input);
  });
}
