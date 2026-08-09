import {NextResponse} from "next/server";import {getStaff,permissionsFor} from "@/lib/server/auth";
export async function GET(){const member=await getStaff();if(!member)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({member,permissions:permissionsFor(member.role)});}
