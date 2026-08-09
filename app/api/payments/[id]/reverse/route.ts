import {NextResponse} from "next/server";
import {requirePermission} from "@/lib/server/auth";
import {getDatabase} from "@/lib/server/database";
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){
 const staff=await requirePermission("finance.reconcile");if(!staff)return NextResponse.json({error:"Forbidden"},{status:403});
 const body=await r.json().catch(()=>null) as {reason?:string}|null,id=(await params).id,reason=body?.reason?.trim();
 if(!reason||!/^\d+$/.test(id))return NextResponse.json({error:"A reversal reason is required"},{status:400});
 const sql=getDatabase();const ok=await sql.begin(async tx=>{
  const documents=await tx`select billing_document_id::text id from public.billing_payment_allocations where payment_id=${Number(id)}`;
  const rows=await tx`update public.payments set verification_status='reversed',reversed_by=${staff.subject}::uuid,reversed_at=now(),reversal_reason=${reason} where id=${Number(id)} and reversed_at is null returning invoice_id`;
  if(!rows[0])return false;
  await tx`delete from public.billing_payment_allocations where payment_id=${Number(id)}`;
  await tx`update public.invoices set amount_paid=(select coalesce(sum(amount),0) from public.payments where invoice_id=${rows[0].invoice_id} and verification_status='verified' and reversed_at is null),paid_at=null where id=${rows[0].invoice_id}`;
  for(const document of documents)await tx`update public.billing_documents d set status=case when coalesce((select sum(a.amount) from public.billing_payment_allocations a join public.payments p on p.id=a.payment_id where a.billing_document_id=d.id and p.verification_status='verified' and p.reversed_at is null),0)>=d.total then 'paid' when coalesce((select sum(a.amount) from public.billing_payment_allocations a join public.payments p on p.id=a.payment_id where a.billing_document_id=d.id and p.verification_status='verified' and p.reversed_at is null),0)>0 then 'partially_paid' when d.due_date<current_date then 'overdue' else 'issued' end,updated_at=now() where d.id=${document.id}::uuid`;
  return true;
 });
 return ok?NextResponse.json({reversed:true}):NextResponse.json({error:"Payment not found"},{status:404});
}
