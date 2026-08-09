"use client";

import { useEffect, useRef } from "react";

const focusable = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function AccessibleDialog({ labelId, className, onClose, children }: { labelId: string; className: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>(focusable)?.focus();
    return () => previous?.focus();
  }, []);
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) || []);
    if (!elements.length) return;
    const first = elements[0]; const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="editor-scrim" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div ref={dialogRef} className={className} role="dialog" aria-modal="true" aria-labelledby={labelId} onKeyDown={onKeyDown}>{children}</div></div>;
}
