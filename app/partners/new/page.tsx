import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/bits";
import { PartnerForm } from "@/app/partners/partner-form";

export const metadata: Metadata = { title: "Add partner" };

export default function NewPartnerPage() {
  return (
    <AppShell>
      <Link className="back" href="/partners"><ArrowLeft size={15} />Partners</Link>
      <PageHeader eyebrow="New partner" title="Add a partner" description="Cake makers, florists and helpers you find on Facebook." />
      <PartnerForm />
    </AppShell>
  );
}
