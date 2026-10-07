import { revalidatePath } from "next/cache";
import { UserError, errorMessage } from "@/lib/actions";
import { db } from "@/lib/db";
import { closeMonthNow } from "@/lib/data/month-close";
import { PAYOUT_DAY, addMonths, currentMonth, today } from "@/lib/format";

// Vercel Cron calls this daily from the 20th to month end (vercel.json) with
// "Authorization: Bearer $CRON_SECRET". It closes last month so the profit share
// paid on the 20th is fixed. If orders are still open it skips and tries again
// the next day; the Reports page shows why.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (Number(today().slice(8)) < PAYOUT_DAY) return Response.json({ ok: true, skipped: `Before the ${PAYOUT_DAY}th` });

  const month = addMonths(currentMonth(), -1);
  try {
    const [closed] = await db()`select 1 from month_closes where month = ${`${month}-01`}::date`;
    if (closed) return Response.json({ ok: true, month, skipped: "Already closed" });
    const result = await closeMonthNow(month, null);
    revalidatePath("/reports");
    return Response.json({ ok: true, month, closed: true, ...result });
  } catch (error) {
    if (error instanceof UserError) return Response.json({ ok: true, month, closed: false, reason: error.message });
    return Response.json({ ok: false, month, error: errorMessage(error) }, { status: 500 });
  }
}
