export interface RunLoopOptions {
  sleep?: (ms: number) => Promise<void>;
  maxIterations?: number;
}

/**
 * Runs `tick` sequentially, waiting for each invocation to settle before
 * scheduling the next one. Unlike setInterval, a slow tick can never overlap
 * with the following one (overlapping ticks caused duplicate captures in the
 * same interval bucket).
 */
export async function runLoop(
  tick: () => Promise<void>,
  intervalMs: number,
  options: RunLoopOptions = {},
): Promise<void> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let iterations = 0;
  for (;;) {
    await tick();
    iterations += 1;
    if (options.maxIterations !== undefined && iterations >= options.maxIterations) return;
    await sleep(intervalMs);
  }
}
