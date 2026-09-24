import { describe, expect, it } from "vitest";
import { ensureBucketExists, keyFor } from "../src/storage.js";

describe("keyFor", () => {
  it("builds org/{slug}/{camera}/{YYYY-MM-DD}/{HHMMSS}.jpg (UTC)", () => {
    const ts = new Date("2026-09-18T09:05:03Z");
    expect(keyFor("acme", "cam-1", ts)).toBe("org/acme/cam-1/2026-09-18/090503.jpg");
  });
});

describe("ensureBucketExists", () => {
  it("creates the bucket when it is missing", async () => {
    const made: string[] = [];
    const client = {
      bucketExists: async () => false,
      makeBucket: async (bucket: string) => {
        made.push(bucket);
      },
    };
    await ensureBucketExists(client, "org");
    expect(made).toEqual(["org"]);
  });

  it("is idempotent across repeated calls (never re-creates an existing bucket)", async () => {
    let exists = false;
    const made: string[] = [];
    const client = {
      bucketExists: async () => exists,
      makeBucket: async (bucket: string) => {
        exists = true;
        made.push(bucket);
      },
    };
    await ensureBucketExists(client, "org");
    await ensureBucketExists(client, "org");
    expect(made).toEqual(["org"]);
  });

  it("does not create the bucket when it already exists", async () => {
    let makeBucketCalls = 0;
    const client = {
      bucketExists: async () => true,
      makeBucket: async (_bucket: string) => {
        makeBucketCalls++;
      },
    };
    await ensureBucketExists(client, "org");
    expect(makeBucketCalls).toBe(0);
  });
});
