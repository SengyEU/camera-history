import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./db.js";

const url = process.env.DATABASE_URL ?? "postgres://camera:camera@127.0.0.1:5432/camera_history";
const db = createDb(url);
await migrate(db, { migrationsFolder: "drizzle" });
const pool = db.$client;
await pool.end();
console.log("migrations applied");