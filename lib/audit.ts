import "server-only";
import { db, type Tx } from "@/lib/db";

export async function audit(userId: string | null, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}, tx?: Tx) {
  const sql = tx ?? db();
  await sql`insert into audit_log (user_id, action, entity, entity_id, details) values (${userId}, ${action}, ${entity}, ${entityId}, ${sql.json(details as never)})`;
}
