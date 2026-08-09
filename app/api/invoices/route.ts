import {NextResponse} from "next/server";import {requirePermission} from "@/lib/server/auth";import {listBilling} from "@/lib/server/billing";
export async function GET(){const s=await requirePermission("finance.read");if(!s)return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json({invoices:await listBilling(s.organizationId)});}
