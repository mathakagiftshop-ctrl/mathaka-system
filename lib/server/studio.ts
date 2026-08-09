import "server-only";
import { getDatabase } from "@/lib/server/database";
export async function audit(organizationId:string,actorId:string,eventType:string,entityType:string,entityId:string|null,payload:Record<string,unknown>={}){const sql=getDatabase();await sql`insert into public.studio_audit_events(organization_id,actor_id,event_type,entity_type,entity_id,payload) values(${organizationId}::uuid,${actorId}::uuid,${eventType},${entityType},${entityId},${sql.json(payload as never)})`;}
