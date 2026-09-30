import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Empty, Money, PageHeader, Stat } from "@/components/bits";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/form";
import { addExpense, deleteExpense } from "@/app/expenses/actions";
import { EXPENSE_CATEGORIES, expenseLabel } from "@/lib/constants";
import { db } from "@/lib/db";
import { currentMonth, formatDate, monthLabel, today } from "@/lib/format";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; category?: string }> }) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : currentMonth();
  const category = EXPENSE_CATEGORIES.some((item) => item.value === params.category) ? params.category! : null;
  const sql = db();
  const [expenses, totals, [stock]] = await Promise.all([
    sql<{ id: string; spent_on: string; category: string; description: string; amount: number; order_id: string | null; order_number: string | null }[]>`
      select e.id, e.spent_on, e.category, e.description, e.amount, e.order_id, o.number as order_number
      from expenses e left join orders o on o.id = e.order_id
      where date_trunc('month', e.spent_on) = ${`${month}-01`}::date ${category ? sql`and e.category = ${category}` : sql``}
      order by e.spent_on desc, e.created_at desc`,
    sql<{ category: string; amount: number }[]>`
      select category, sum(amount) as amount from expenses where date_trunc('month', spent_on) = ${`${month}-01`}::date group by category`,
    sql<{ bought: number }[]>`
      select coalesce(sum(total_cost), 0) as bought from stock_purchases where date_trunc('month', bought_on) = ${`${month}-01`}::date`,
  ]);
  const total = totals.reduce((sum, row) => sum + row.amount, 0);
  const ads = totals.find((row) => row.category === "meta_ads")?.amount ?? 0;

  return (
    <AppShell permission="finance">
      <PageHeader eyebrow="Expenses" title={monthLabel(month)} description={<>Business costs like Meta ads, packaging and phone bills. Costs for one order are added on that order&apos;s page. Things bought in bulk to use on orders (frames etc.) go in <Link className="link" href="/stock">Stock</Link>.</>} />
      <form className="filters" action="/expenses">
        <label className="field"><span>Month</span><input type="month" name="month" defaultValue={month} /></label>
        <label className="field"><span>Category</span>
          <select name="category" defaultValue={category ?? ""}>
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Show</button>
      </form>

      <div className="stats">
        <Stat label="Spent this month" value={<Money value={total} />} tone="dark" />
        {stock.bought > 0 && <Stat label="Stock bought" value={<Money value={stock.bought} />} note={<Link className="link" href={`/stock?month=${month}`}>Not in this list →</Link>} />}
        <Stat label="Meta ads" value={<Money value={ads} />} note={<Link className="link" href={`/reports?month=${month}`}>Cost per order →</Link>} />
        {totals.filter((row) => row.category !== "meta_ads").slice(0, 3).map((row) => (
          <Stat key={row.category} label={expenseLabel(row.category)} value={<Money value={row.amount} />} />
        ))}
      </div>

      <div className="grid sidebar-right">
        <div>
          {expenses.length === 0 ? <Empty title="No expenses this month" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>What</th><th>Category</th><th className="right">Amount</th><th /></tr></thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="num">{formatDate(expense.spent_on)}</td>
                      <td>{expense.description}{expense.order_id && <small>for <Link className="link" href={`/orders/${expense.order_id}`}>{expense.order_number}</Link></small>}</td>
                      <td>{expenseLabel(expense.category)}</td>
                      <td className="right"><Money value={expense.amount} /></td>
                      <td className="right"><ActionButton action={deleteExpense} fields={{ expense_id: expense.id }} className="btn small ghost" confirm="Delete this expense?">Delete</ActionButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <section className="card">
          <h2>Add an expense</h2>
          <ActionForm action={addExpense}>
            <Select label="Category" name="category" options={EXPENSE_CATEGORIES} defaultValue="meta_ads" />
            <Field label="What" name="description" required placeholder="e.g. Facebook ads — Birthday campaign" />
            <div className="form-grid">
              <Field label="Amount" name="amount" type="number" min="1" step="0.01" required />
              <Field label="Date" name="spent_on" type="date" defaultValue={today()} required />
            </div>
            <Submit>Add expense</Submit>
          </ActionForm>
        </section>
      </div>
    </AppShell>
  );
}
