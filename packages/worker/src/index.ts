import { loadConfig } from "@ch/core";
import { createDb } from "@ch/db";
import { createRepos } from "@ch/db";
import { createObjectStorage } from "@ch/db";
import { runSchedule } from "./captureRun.js";
import { createMeteringGateway } from "./stripe.js";
import { runBillingJobs } from "./billing.js";

const cfg = loadConfig(process.env);
const db = createDb(cfg.databaseUrl);
const repos = createRepos(db);
const storage = createObjectStorage(cfg);
const metering = createMeteringGateway(cfg);

async function tick() {
  const processed = await runSchedule({ repos, storage, cfg, log: (m) => console.log(m) });
  if (processed > 0) console.log(`tick: captured/attempted ${processed}`);
  await runBillingJobs({ repos, cfg, metering, log: (m) => console.log(m) });
}

console.log("worker starting");
await tick();
setInterval(tick, cfg.worker.tickMs);

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));