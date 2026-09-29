import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LoginForm, SetupForm } from "@/app/login/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getUser()) redirect("/");
  const { next } = await searchParams;
  const [{ count }] = await db()<{ count: number }[]>`select count(*)::int as count from users`;
  const firstRun = count === 0;
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark"><span /></span>
          <div><strong>Mathaka</strong><small>Celebration studio</small></div>
        </div>
        <h1>{firstRun ? "Set up your studio" : "Welcome back"}</h1>
        <p>{firstRun ? "Create the owner account. You can add your team from Settings afterwards." : "Sign in to manage orders, partners and money."}</p>
        {firstRun ? <SetupForm /> : <LoginForm next={next} />}
      </div>
    </div>
  );
}
