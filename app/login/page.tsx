import { Gift, LockKeyhole, ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand"><span className="brand-mark"><span/></span><span><strong>Mathaka</strong><small>Celebration studio</small></span></div>
        <div><span className="eyebrow">The private studio door</span><h1>Welcome back<br/>to the magic.</h1><p>Orders, conversations, partner payments and celebration memories stay behind one owner-only sign-in.</p></div>
        <div className="login-trust"><span><ShieldCheck/>Verified by Supabase Auth</span><span><LockKeyhole/>WhatsApp pairing stays private</span></div>
      </section>
      <section className="login-card-wrap">
        <div className="login-card-mark"><Gift/></div>
        <div className="login-card"><span className="eyebrow">Owner access</span><h2>Open the studio</h2><p>We’ll email you a one-time link. No password to remember, and the link expires automatically.</p><LoginForm/><small>Only the registered Mathaka owner email can enter.</small></div>
      </section>
    </main>
  );
}
