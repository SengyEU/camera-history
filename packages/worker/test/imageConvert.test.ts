import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { toWebp, WEBP_ARGS } from "../src/imageConvert.js";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;

function makeJpeg(width: number, height: number): Buffer {
  const res = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=${width}x${height}`, "-frames:v", "1", "-q:v", "2", "-f", "mjpeg", "pipe:1"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0) throw new Error(`ffmpeg jpeg generation failed: ${res.stderr.toString().slice(0, 200)}`);
  return res.stdout;
}

describe("WEBP_ARGS", () => {
  it("pins the WebP conversion parameters", () => {
    const args = WEBP_ARGS.join(" ");
    expect(args).toContain("-vf scale='min(1600,iw)':-2");
    expect(args).toContain("-c:v libwebp -quality 75");
    expect(args).toContain("-f webp pipe:1");
  });
});

describe.skipIf(!ffmpegAvailable)("toWebp", () => {
  it("converts a 2000x1000 JPEG to WebP with RIFF/WEBP magic and smaller output", { timeout: 30_000 }, async () => {
    const jpeg = makeJpeg(2000, 1000);
    expect(jpeg.length).toBeGreaterThan(0);
    const webp = await toWebp(jpeg);
    expect(webp.subarray(0, 4).toString()).toBe("RIFF");
    expect(webp.subarray(8, 12).toString()).toBe("WEBP");
    expect(webp.length).toBeLessThan(jpeg.length);
  });
});
