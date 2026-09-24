import { loadConfig } from "@ch/core";
import { createDb, createObjectStorage, createRepos } from "@ch/db";
import { buildApp } from "./app.js";
import { createStripeGateway } from "./stripe/gateway.js";

const cfg = loadConfig(process.env);
const db = createDb(cfg.databaseUrl);
const repos = createRepos(db);
const storage = createObjectStorage(cfg);
const stripe = createStripeGateway(cfg);
const app = buildApp({ cfg, repos, storage, stripe });

await app.listen({ port: cfg.api.port, host: "127.0.0.1" });