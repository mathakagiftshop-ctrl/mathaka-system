import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/client-bits";
import { DocumentPaper } from "@/components/document-paper";
import { getSharedDocument } from "@/lib/data/documents";
import { DOCUMENT_LABELS } from "@/lib/document-types";
import { viewUrl } from "@/lib/storage";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const found = await getSharedDocument((await params).token);
  return { title: found ? `${DOCUMENT_LABELS[found.snapshot.kind]} ${found.snapshot.number}` : "Document" };
}

/** Public customer view of an issued document. Anyone with the link can see it. */
export default async function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const found = await getSharedDocument((await params).token);
  if (!found) notFound();
  const logoUrl = found.snapshot.business.logoKey ? await viewUrl(found.snapshot.business.logoKey) : null;
  return (
    <div className="public-page">
      <div className="public-actions">
        <PrintButton label="Download PDF" className="btn primary" />
      </div>
      <DocumentPaper snapshot={found.snapshot} status={found.doc.status} logoUrl={logoUrl} live={found.live} />
    </div>
  );
}
