import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/bits";
import { OrderForm } from "@/app/orders/order-form";
import { customerOptions, getOrder } from "@/lib/data/orders";

export const metadata: Metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, customers] = await Promise.all([getOrder(id), customerOptions()]);
  if (!order) notFound();
  return (
    <AppShell>
      <Link className="back" href={`/orders/${order.id}`}><ArrowLeft size={15} />{order.number}</Link>
      <PageHeader eyebrow={order.number} title={`Edit ${order.recipient_name}'s order`} />
      <OrderForm
        customers={customers}
        order={{
          id: order.id, customer_id: order.customer_id, recipient_name: order.recipient_name, recipient_phone: order.recipient_phone,
          delivery_address: order.delivery_address, city: order.city, occasion: order.occasion, delivery_date: order.delivery_date,
          delivery_time: order.delivery_time, source: order.source, delivery_fee: order.delivery_fee, markup: order.markup, discount: order.discount,
          special_request: order.special_request, internal_notes: order.internal_notes,
          items: order.items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unit_price })),
        }}
      />
    </AppShell>
  );
}
