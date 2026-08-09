import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";

export const dynamic = "force-dynamic";

export async function POST() {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const sql = getDatabase();
  await sql`
    insert into public.integration_commands (integration, command, payload, requested_by)
    values ('whatsapp', 'logout', '{}', ${owner.subject}::uuid)
  `;
  return NextResponse.json({ queued: true }, { status: 202 });
}
