import { revalidatePath } from "next/cache";
import { UserError, errorMessage } from "@/lib/actions";
import { db } from "@/lib/db";
import { closeMonthNow } from "@/lib/data/month-close";
import { addMonths, lastEndedPeriod, payoutDate, today } from "@/lib/format";

// Vercel Cron calls this every night at 23:30 Sri Lanka time (vercel.json) with
// "Authorization: Bearer $CRON_SECRET". On the 20th it closes the period that ends
// that day (21st–20th), so the profit share paid then is fixed. If orders are still
// open it skips and tries again the next night; the Reports page shows why.
// The period before is retried too, so one that couldn't close still gets closed.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const due = [addMonths(lastEndedPeriod(), -1), lastEndedPeriod()].filter((period) => payoutDate(period) <= today());
  const results = [];
  let failed = false;
  for (const month of due) {
    try {
      const [closed] = await db()`select 1 from month_closes where month = ${`${month}-01`}::date`;
      if (closed) { results.push({ month, skipped: "Already closed" }); continue; }
      const result = await closeMonthNow(month, null);
      results.push({ month, closed: true, ...result });
    } catch (error) {
      if (error instanceof UserError) { results.push({ month, closed: false, reason: error.message }); continue; }
      failed = true;
      results.push({ month, error: errorMessage(error) });
    }
  }
  revalidatePath("/reports");
  return Response.json({ ok: !failed, results }, { status: failed ? 500 : 200 });
}
