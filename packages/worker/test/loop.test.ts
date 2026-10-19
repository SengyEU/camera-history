import { describe, expect, it } from "vitest";
import { runLoop } from "../src/loop.js";

describe("runLoop", () => {
  it("never overlaps ticks even when a tick takes longer than the interval", async () => {
    const events: string[] = [];
    const sleep = async (ms: number) => {
      events.push(`sleep:${ms}`);
    };
    await runLoop(
      async () => {
        events.push("tick:start");
        await new Promise((resolve) => setTimeout(resolve, 25));
        events.push("tick:end");
      },
      10,
      { sleep, maxIterations: 3 },
    );
    expect(events).toEqual([
      "tick:start",
      "tick:end",
      "sleep:10",
      "tick:start",
      "tick:end",
      "sleep:10",
      "tick:start",
      "tick:end",
    ]);
  });

  it("propagates a tick rejection to the caller", async () => {
    await expect(
      runLoop(
        async () => {
          throw new Error("boom");
        },
        10,
        { sleep: async () => {}, maxIterations: 1 },
      ),
    ).rejects.toThrow("boom");
  });
});
