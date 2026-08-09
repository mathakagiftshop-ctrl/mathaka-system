import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { taskPatchSchema } from "@/lib/server/validation";

const UUID = /^[0-9a-f-]{36}$/i;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, taskId } = await params;
  if (!/^\d+$/.test(id) || !UUID.test(taskId)) return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  const parsed = taskPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const sql = getDatabase();
  const rows = await sql<{ id: string; title: string; kind: string; assignee_name: string | null; due_at: Date | string | null; completed_at: Date | string | null }[]>`
    update public.celebration_tasks set
      title = coalesce(${data.title ?? null}, title), kind = coalesce(${data.kind ?? null}, kind),
      assignee_name = case when ${data.assignee === undefined} then assignee_name else ${data.assignee ?? null} end,
      due_at = case when ${data.dueAt === undefined} then due_at else ${data.dueAt ? new Date(data.dueAt) : null} end,
      completed_at = case when ${data.complete === undefined} then completed_at when ${data.complete ?? false} then now() else null end
    where id = ${taskId}::uuid and invoice_id = ${Number(id)}
    returning id::text, title, kind, assignee_name, due_at, completed_at
  `;
  if (!rows.length) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const task = rows[0];
  return NextResponse.json({ task: { id: task.id, title: task.title, kind: task.kind, assignee: task.assignee_name || "Unassigned", due: task.due_at ? new Date(task.due_at).toISOString() : null, complete: Boolean(task.completed_at) } });
}
