import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/bits";
import { PartnerForm } from "@/app/partners/partner-form";
import { getPartner } from "@/lib/data/partners";

export const metadata: Metadata = { title: "Edit partner" };

export default async function EditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const partner = await getPartner((await params).id);
  if (!partner) notFound();
  return (
    <AppShell>
      <Link className="back" href={`/partners/${partner.id}`}><ArrowLeft size={15} />{partner.name}</Link>
      <PageHeader eyebrow="Edit partner" title={partner.name} />
      <PartnerForm partner={partner} />
    </AppShell>
  );
}
