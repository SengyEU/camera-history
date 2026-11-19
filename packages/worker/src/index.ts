import { loadConfig } from "@ch/core";
import { createDb } from "@ch/db";
import { createRepos } from "@ch/db";
import { createObjectStorage } from "@ch/db";
import { runSchedule } from "./captureRun.js";
import { createSubscriptionSyncGateway } from "./stripe.js";
import { runBillingJobs } from "./billing.js";
import { purgeExpiredImages } from "./retention.js";
import { runLoop } from "./loop.js";

const cfg = loadConfig(process.env);
const db = createDb(cfg.databaseUrl);
const repos = createRepos(db);
const storage = createObjectStorage(cfg);
const sync = createSubscriptionSyncGateway(cfg);
const PURGE_INTERVAL_MS = 86_400_000;
let lastPurge = 0;

async function tick() {
  const processed = await runSchedule({ repos, storage, cfg, log: (m) => console.log(m) });
  if (processed > 0) console.log(`tick: captured/attempted ${processed}`);
  await runBillingJobs({ repos, cfg, sync, log: (m) => console.log(m) });
  if (Date.now() - lastPurge >= PURGE_INTERVAL_MS) {
    const removed = await purgeExpiredImages({
      repos,
      storage,
      log: (m) => console.log(m),
    });
    lastPurge = Date.now();
    if (removed > 0) console.log(`retention: removed ${removed} image row(s)`);
  }
}

console.log("worker starting");
// Sequential loop (not setInterval): a slow tick must never overlap the next
// tick, otherwise two ticks can both see a stale lastCaptureAt and capture
// the same interval twice.
await runLoop(async () => {
  try {
    await tick();
  } catch (error) {
    console.error("tick failed:", error);
  }
}, cfg.worker.tickMs);

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
