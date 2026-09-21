import { loadConfig } from "@ch/core";
import { createDb, createObjectStorage, createRepos } from "@ch/db";
import { buildApp } from "./app.js";

const cfg = loadConfig(process.env);
const db = createDb(cfg.databaseUrl);
const repos = createRepos(db);
const storage = createObjectStorage(cfg);
const app = buildApp({ cfg, repos, storage });

await app.listen({ port: cfg.api.port, host: "127.0.0.1" });