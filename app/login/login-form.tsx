"use client";

import { useActionState } from "react";
import { LoaderCircle, Mail, Sparkles } from "lucide-react";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle", message: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initialState);

  return (
    <form action={action} className="login-form">
      <label htmlFor="email">Studio owner email</label>
      <div className="login-input"><Mail size={18}/><input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></div>
      <button type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18}/> : <Sparkles size={18}/>}Send secure sign-in link</button>
      {state.message && <p className={`login-message ${state.status}`} role="status">{state.message}</p>}
    </form>
  );
}
