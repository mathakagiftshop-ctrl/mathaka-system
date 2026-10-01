import "server-only";
import postgres from "postgres";

const globalForDb = globalThis as unknown as { mathakaSql?: postgres.Sql };

/**
 * One small client per server instance. DATABASE_URL should point at the
 * provider's connection pooler (Neon: the `-pooler` host), which is what makes
 * many serverless instances safe. Functions run in sin1 (vercel.json), next to
 * the Neon database in ap-southeast-1.
 */
export function db() {
  if (!globalForDb.mathakaSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    globalForDb.mathakaSql = postgres(url, {
      // Pages fire several queries with Promise.all; with 1 connection they'd queue.
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      transform: { undefined: null },
      types: {
        // Return numeric/bigint as JS numbers; amounts are well inside double precision.
        numeric: { to: 1700, from: [1700], serialize: (value: number) => String(value), parse: (value: string) => Number(value) },
        bigint: { to: 20, from: [20], serialize: (value: number) => String(value), parse: (value: string) => Number(value) },
        // Keep calendar dates as 'YYYY-MM-DD' strings so they never shift across time zones.
        date: { to: 1082, from: [1082], serialize: (value: string) => value, parse: (value: string) => value },
      },
    });
  }
  return globalForDb.mathakaSql;
}

export type Tx = postgres.TransactionSql;
