import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { taskCreateSchema } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const parsed = taskCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task", details: parsed.error.flatten() }, { status: 400 });
  const sql = getDatabase();
  const exists = await sql`select id from public.invoices where id = ${Number(id)} limit 1`;
  if (!exists.length) return NextResponse.json({ error: "Celebration not found" }, { status: 404 });
  const rows = await sql<{ id: string; title: string; kind: string; assignee_name: string | null; due_at: Date | string | null }[]>`
    insert into public.celebration_tasks (invoice_id, title, kind, assignee_name, due_at, sort_order)
    values (${Number(id)}, ${parsed.data.title}, ${parsed.data.kind}, ${parsed.data.assignee ?? null}, ${parsed.data.dueAt ? new Date(parsed.data.dueAt) : null},
      coalesce((select max(sort_order) + 1 from public.celebration_tasks where invoice_id = ${Number(id)}), 0))
    returning id::text, title, kind, assignee_name, due_at
  `;
  return NextResponse.json({ task: serialize(rows[0], false) }, { status: 201 });
}

function serialize(task: { id: string; title: string; kind: string; assignee_name: string | null; due_at: Date | string | null }, complete: boolean) {
  return { id: task.id, title: task.title, kind: task.kind, assignee: task.assignee_name || "Unassigned", due: task.due_at ? new Date(task.due_at).toISOString() : null, complete };
}
