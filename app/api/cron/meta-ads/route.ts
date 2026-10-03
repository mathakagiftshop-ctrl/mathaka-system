import { revalidatePath } from "next/cache";
import { errorMessage } from "@/lib/actions";
import { syncMetaAds } from "@/lib/meta-ads";

// Vercel Cron calls this daily (vercel.json) with "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncMetaAds();
    revalidatePath("/expenses");
    revalidatePath("/reports");
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
