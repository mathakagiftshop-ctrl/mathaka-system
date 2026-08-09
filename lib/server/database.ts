import "server-only";
import postgres from "postgres";

const globalForDatabase = globalThis as unknown as {
  mathakaSql?: ReturnType<typeof postgres>;
};

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");

  if (!globalForDatabase.mathakaSql) {
    globalForDatabase.mathakaSql = postgres(connectionString, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
    });
  }

  return globalForDatabase.mathakaSql;
}
