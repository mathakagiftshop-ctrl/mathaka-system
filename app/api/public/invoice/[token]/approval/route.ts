import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {getDatabase} from "@/lib/server/database";
export async function POST(r:Request,{params}:{params:Promise<{token:string}>}){
  const body=await r.json().catch(()=>null) as {decision?:string;note?:string}|null;
  if(!body||!['approved','declined'].includes(body.decision||''))return NextResponse.json({error:"Invalid decision"},{status:400});
  const decision=body.decision as 'approved'|'declined';
  const hash=createHash('sha256').update((await params).token).digest('hex'),sql=getDatabase();
  const rows=await sql`update public.billing_documents d set approval_status=${decision},approved_at=case when ${decision}='approved' then now() end,approval_note=${body.note||null},updated_at=now() from public.billing_share_links l where l.billing_document_id=d.id and l.token_hash=${hash} and l.revoked_at is null and l.expires_at>now() and d.document_type in ('quote','proforma') returning d.id`;
  if(!rows[0])return NextResponse.json({error:"Approval link is invalid or expired"},{status:404});
  return NextResponse.json({approved:decision==='approved'});
}
