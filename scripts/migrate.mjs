// Applies db/migrations/*.sql in filename order, once each.
// Usage: npm run db:migrate   (reads DATABASE_URL from .env.local)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const dir = path.join(import.meta.dirname, "..", "db", "migrations");
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from schema_migrations`).map((row) => row.name));
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
    count += 1;
  }
  console.log(count ? `${count} migration(s) applied.` : "Database is up to date.");
} finally {
  await sql.end();
}
