"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { formAction, positiveMoney, requiredDate, requiredText, UserError, uuid } from "@/lib/actions";
import { EXPENSE_CATEGORY_VALUES } from "@/lib/constants";
import { db } from "@/lib/db";

export const addExpense = formAction(z.object({
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  description: requiredText(300),
  amount: positiveMoney,
  spent_on: requiredDate,
}), async (input, user) => {
  await db()`insert into expenses (category, description, amount, spent_on, created_by)
             values (${input.category}, ${input.description}, ${input.amount}, ${input.spent_on}, ${user.id})`;
  await audit(user.id, "expense.added", "expense", null, input);
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return "Expense added.";
}, "finance");

export const deleteExpense = formAction(z.object({ expense_id: uuid }), async ({ expense_id }, user) => {
  const sql = db();
  const [row] = await sql<{ order_id: string | null; spent_on: string }[]>`select order_id, spent_on from expenses where id = ${expense_id}`;
  if (!row) throw new UserError("Already deleted.");
  const [closed] = await sql`select 1 from month_closes where month = date_trunc('month', ${row.spent_on}::date)::date`;
  if (closed) throw new UserError("That month is closed. Reopen it in Reports first.");
  await sql`delete from expenses where id = ${expense_id}`;
  await audit(user.id, "expense.deleted", "expense", expense_id);
  revalidatePath("/expenses");
  revalidatePath("/reports");
  if (row.order_id) revalidatePath(`/orders/${row.order_id}`);
  return "Expense deleted.";
}, "finance");
