import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/bits";
import { OrderForm } from "@/app/orders/order-form";
import { customerOptions } from "@/lib/data/orders";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  const customers = await customerOptions();
  const preselected = customers.find((row) => row.id === customer);
  return (
    <AppShell>
      <Link className="back" href="/orders"><ArrowLeft size={15} />Orders</Link>
      <PageHeader eyebrow="New order" title="Take a new order" description="Fill in what the customer told you on WhatsApp. You can change everything later." />
      <OrderForm customers={customers} prefill={preselected ? { customer_id: preselected.id } : undefined} />
    </AppShell>
  );
}
