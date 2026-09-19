"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Free credits for every beta signup, so testers can render a few videos.
const BETA_CREDITS = Number(process.env.BETA_CREDITS ?? 20);

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/cards";
}

function fail(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) fail(error.message);
  redirect(safeNext(formData.get("next")));
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) fail(error.message);

  // public.users is created by the signup trigger; top it up once, while it
  // still has no credits.
  if (data.user && BETA_CREDITS > 0) {
    await createAdminClient()
      .from("users")
      .update({ credits_remaining: BETA_CREDITS })
      .eq("id", data.user.id)
      .eq("credits_remaining", 0);
  }

  // With email confirmation off in Supabase, signUp signs the user straight in.
  if (data.session) redirect("/onboarding");
  redirect("/login?message=Check your email to confirm your account, then sign in.");
}
