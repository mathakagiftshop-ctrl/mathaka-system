import {NextResponse} from "next/server";
import {requirePermission} from "@/lib/server/auth";
import {getDatabase} from "@/lib/server/database";
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){
 const staff=await requirePermission("celebrations.write");if(!staff)return NextResponse.json({error:"Forbidden"},{status:403});
 const body=await r.json().catch(()=>null) as {invoiceId?:number}|null;
 if(!body?.invoiceId||!Number.isInteger(body.invoiceId))return NextResponse.json({error:"Valid celebration required"},{status:400});
 const invoiceId=body.invoiceId,templateId=(await params).id,sql=getDatabase();
 const created=await sql.begin(async tx=>{
  const templates=await tx`select steps from public.studio_task_templates where id=${templateId}::uuid and organization_id=${staff.organizationId}::uuid and active`;if(!templates[0])return null;
  const invoices=await tx`select coalesce(j.delivery_at,now()) due_at from public.invoices i left join public.celebration_journeys j on j.invoice_id=i.id where i.id=${invoiceId}`;if(!invoices[0])return null;
  const rows=[];for(const [index,step] of (templates[0].steps as Array<{title:string;kind:string;offsetHours:number}>).entries()){const inserted=await tx`insert into public.celebration_tasks(invoice_id,title,kind,due_at,sort_order,assignee_name) values(${invoiceId},${step.title},${step.kind},${invoices[0].due_at}::timestamptz+(${step.offsetHours}||' hours')::interval,${index},'Studio') returning id::text`;rows.push(inserted[0]);}
  return rows;
 });
 return created?NextResponse.json({tasks:created},{status:201}):NextResponse.json({error:"Template or celebration not found"},{status:404});
}
