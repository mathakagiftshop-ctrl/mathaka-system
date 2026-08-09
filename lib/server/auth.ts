import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDatabase } from "@/lib/server/database";

export type StudioRole = "owner" | "manager" | "staff";
export type StudioPermission = "studio.read"|"celebrations.write"|"finance.read"|"finance.write"|"finance.reconcile"|"settings.write"|"team.write";
export type StaffSession = { email:string; subject:string; organizationId:string; memberId:string; displayName:string; role:StudioRole };
const grants:Record<StudioRole,Set<StudioPermission>>={owner:new Set(["studio.read","celebrations.write","finance.read","finance.write","finance.reconcile","settings.write","team.write"]),manager:new Set(["studio.read","celebrations.write","finance.read","finance.write","finance.reconcile"]),staff:new Set(["studio.read","celebrations.write"])};

export async function getStaff():Promise<StaffSession|null>{
  const supabase=await createClient(); const {data,error}=await supabase.auth.getClaims();
  if(error||!data?.claims) return null;
  const email=typeof data.claims.email==="string"?data.claims.email.trim().toLowerCase():null;
  const subject=String(data.claims.sub||""); if(!email||!subject) return null;
  const sql=getDatabase();
  let rows=await sql<{id:string;organization_id:string;display_name:string|null;role:StudioRole}[]>`select id::text,organization_id::text,display_name,role from public.studio_members where user_id=${subject}::uuid and status='active' limit 1`;
  if(!rows[0]&&email===process.env.MATHAKA_OWNER_EMAIL?.trim().toLowerCase()){
    rows=await sql.begin(async tx=>{
      await tx`select pg_advisory_xact_lock(682401)`;
      const existing=await tx<{count:number}[]>`select count(*)::int as count from public.studio_members`;
      if(existing[0].count===0) await tx`insert into public.studio_members(organization_id,user_id,email,display_name,role,status,accepted_at) select id,${subject}::uuid,${email},'Sachin','owner','active',now() from public.studio_organizations order by created_at limit 1`;
      return tx<{id:string;organization_id:string;display_name:string|null;role:StudioRole}[]>`select id::text,organization_id::text,display_name,role from public.studio_members where user_id=${subject}::uuid and status='active' limit 1`;
    });
  }
  const member=rows[0]; if(!member) return null;
  await sql`update public.studio_members set last_seen_at=now() where id=${member.id}::uuid`;
  return {email,subject,organizationId:member.organization_id,memberId:member.id,displayName:member.display_name||email,role:member.role};
}
export async function requirePermission(permission:StudioPermission){const staff=await getStaff();if(!staff)return null;return grants[staff.role].has(permission)?staff:null;}
/** Compatibility helper for existing operational routes; all active studio roles may use them. */
export async function getOwner(){return getStaff();}
export function permissionsFor(role:StudioRole){return [...grants[role]];}
