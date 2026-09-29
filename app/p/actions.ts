"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { audit } from "@/lib/audit";
import { errorMessage, UserError, type ActionState } from "@/lib/actions";
import { db } from "@/lib/db";
import { directUploadUrl } from "@/lib/storage";

// Actions for the public partner page. The token in the link is the only
// credential, so every action re-checks it and only touches that one job.

type Job = { id: string; order_id: string; partner_name: string; status: string };

async function jobFor(token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) throw new UserError("This link is not valid.");
  const [job] = await db()<Job[]>`
    select j.id, j.order_id, p.name as partner_name, j.status from partner_jobs j join partners p on p.id = j.partner_id
    where j.share_token = ${token} and (j.share_expires_at is null or j.share_expires_at > now())`;
  if (!job) throw new UserError("This link has expired. Ask Mathaka for a new one.");
  return job;
}

export async function partnerSetStatus(token: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const status = String(formData.get("status"));
    if (!["accepted", "ready", "delivered"].includes(status)) throw new UserError("Unknown status.");
    const job = await jobFor(token);
    if (job.status === "cancelled") throw new UserError("This job was cancelled.");
    const sql = db();
    await sql.begin(async (tx) => {
      await tx`update partner_jobs set status = ${status}, updated_at = now() where id = ${job.id}`;
      if (status === "delivered") {
        // When every partner job is delivered, the order is delivered.
        await tx`update orders set status = 'delivered', delivered_at = coalesce(delivered_at, now()), updated_at = now()
                 where id = ${job.order_id} and status in ('confirmed','in_progress','out_for_delivery')
                   and not exists (select 1 from partner_jobs where order_id = ${job.order_id} and status not in ('delivered','cancelled'))`;
      }
      await audit(null, `partner_link.${status}`, "job", job.id, { by: job.partner_name }, tx);
    });
    revalidatePath(`/p/${token}`);
    revalidatePath(`/orders/${job.order_id}`);
    return { ok: true, message: "Thank you! Mathaka has been updated.", at: Date.now() };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error), at: Date.now() };
  }
}

export async function partnerStartUpload(token: string, contentType: string, size: number) {
  const job = await jobFor(token);
  return directUploadUrl(`orders/${job.order_id}`, contentType, size);
}

export async function partnerFinishUpload(token: string, key: string, contentType: string, caption: string) {
  const job = await jobFor(token);
  if (!key.startsWith(`orders/${job.order_id}/`)) throw new UserError("Invalid upload.");
  await db()`insert into order_media (order_id, kind, storage_key, content_type, caption, uploaded_by)
             values (${job.order_id}, ${contentType.startsWith("video/") ? "video" : "photo"}, ${key}, ${contentType}, ${caption.slice(0, 200)}, ${job.partner_name})`;
  revalidatePath(`/orders/${job.order_id}`);
}
