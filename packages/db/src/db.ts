import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { tables } from "./schema.js";

export type Db = NodePgDatabase<typeof tables> & { $client: pg.Pool };

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema: tables }) as Db;
}