"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/form";
import { setupOwner, signIn } from "@/app/login/actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, {});
  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required autoFocus /></label>
      <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
      <FormMessage state={state} />
      <Submit pendingText="Signing in…">Sign in</Submit>
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupOwner, {});
  return (
    <form action={action} className="form">
      <label className="field"><span>Your name</span><input name="name" required autoComplete="name" /></label>
      <label className="field"><span>Owner email</span><input name="email" type="email" required autoComplete="email" /></label>
      <label className="field"><span>Password</span><input name="password" type="password" minLength={10} required autoComplete="new-password" /><small>At least 10 characters.</small></label>
      <FormMessage state={state} />
      <Submit pendingText="Creating…">Create owner account</Submit>
    </form>
  );
}
