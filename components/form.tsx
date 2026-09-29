"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action. Shows the action's error or success message
 * and optionally runs `onSuccess` (e.g. to close a panel).
 */
export function ActionForm({
  action, children, className = "form", resetOnSuccess = true, confirm, onSuccess, id,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  onSuccess?: () => void;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const handled = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state.ok || !resetOnSuccess || handled.current === state.at) return;
    handled.current = state.at;
    onSuccess?.();
    const details = ref.current?.closest("details");
    if (details) details.open = false;
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <form
      id={id}
      ref={ref}
      className={className}
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) return <p className="notice error" role="alert" key={state.at}>{state.error}</p>;
  if (state.ok && state.message) return <p className="notice success" role="status" key={state.at}>{state.message}</p>;
  return null;
}

export function Submit({ children, className = "btn primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

type FieldProps = {
  label: string;
  name: string;
  hint?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">;

export function Field({ label, name, hint, className, ...input }: FieldProps) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>{label}</span>
      <input name={name} {...input} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function TextArea({ label, name, hint, className, ...props }: { label: string; name: string; hint?: string; className?: string } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>{label}</span>
      <textarea name={name} {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Select({ label, name, options, hint, className, ...props }: {
  label: string; name: string; hint?: string; className?: string;
  options: readonly { value: string; label: string }[];
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>{label}</span>
      <select name={name} {...props}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** A small one-button form, e.g. "Verify" or "Mark ready". */
export function ActionButton({ action, children, className = "btn small", confirm, fields = {} }: {
  action: Action; children: React.ReactNode; className?: string; confirm?: string; fields?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} style={{ display: "inline" }} onSubmit={(event) => {
      if (confirm && !window.confirm(confirm)) event.preventDefault();
    }}>
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <Submit className={className} pendingText="…">{children}</Submit>
      {state.error && <span className="notice error" role="alert" style={{ display: "block", marginTop: 6 }}>{state.error}</span>}
    </form>
  );
}
