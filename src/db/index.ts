import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/config";

import * as schema from "./schema";

declare global {
  var __generalAgentPool: Pool | undefined;
  var __generalAgentDb: NodePgDatabase<typeof schema> | undefined;
}

const globalForDb = globalThis as typeof globalThis & {
  __generalAgentPool?: Pool;
  __generalAgentDb?: NodePgDatabase<typeof schema>;
};

function createPool() {
  return new Pool({
    connectionString: env.DATABASE_URL,
  });
}

export const pool =
  globalForDb.__generalAgentPool ??
  (globalForDb.__generalAgentPool = createPool());

export const db =
  globalForDb.__generalAgentDb ??
  (globalForDb.__generalAgentDb = drizzle(pool, { schema }));

export type DbClient = typeof db;
export { schema };
