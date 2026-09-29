"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";

export function CopyButton({ text, label = "Copy link", className = "btn small" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        window.prompt("Copy this link", text);
      }
    }}>
      {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : label}
    </button>
  );
}

export function PrintButton({ label = "Print / Save PDF", className = "btn" }: { label?: string; className?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}><Printer size={16} />{label}</button>;
}

/** Native share sheet on phones (WhatsApp, etc.), copy on desktop. */
export function ShareButton({ url, title, text, className = "btn" }: { url: string; title: string; text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      if (navigator.share) {
        try { await navigator.share({ url, title, text }); } catch { /* cancelled */ }
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }}>
      {copied ? "Link copied" : "Share…"}
    </button>
  );
}
