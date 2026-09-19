import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Who the request acts as. With AUTH_REQUIRED=true (production) that's the
// signed-in Supabase user; otherwise (local dev) a dev account, switchable
// via /dev/switch. Callers use the service-role client, so RLS is bypassed;
// always filter by user.id explicitly.
export const AUTH_REQUIRED = process.env.AUTH_REQUIRED === "true";
const DEFAULT_EMAIL = process.env.DEV_USER_EMAIL || "dev@d2c-content-engine.local";

// Dev-only account switcher (/dev/switch): a cookie picks one of the local
// test accounts, so different browser tabs/hosts can look at different brands.
export const DEV_USER_COOKIE = "dev_user";
const TEST_DOMAIN = "@d2c-content-engine.local";

export function isTestAccount(email: string) {
  return email.endsWith(TEST_DOMAIN) && !email.includes("/");
}

async function currentEmail() {
  try {
    const picked = (await cookies()).get(DEV_USER_COOKIE)?.value;
    return picked && isTestAccount(picked) ? picked : DEFAULT_EMAIL;
  } catch {
    // Outside a request (scripts): no cookies.
    return DEFAULT_EMAIL;
  }
}

const cache = new Map<string, { id: string; email: string }>();

// The signed-in user, or null. Only meaningful with AUTH_REQUIRED.
export async function getSignedInUser(): Promise<{ id: string; email: string } | null> {
  if (!AUTH_REQUIRED) return getCurrentUser();
  const { data } = await (await createClient()).auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
}

export async function getCurrentUser(): Promise<{ id: string; email: string }> {
  // Pages that know the user are per-request: never prerender them at build
  // time (secrets aren't there yet). Skipped in CLI scripts (no Next runtime).
  if (process.env.NEXT_RUNTIME) await connection();
  if (AUTH_REQUIRED) {
    const user = await getSignedInUser();
    if (!user) redirect("/login");
    return user;
  }
  const email = await currentEmail();
  const hit = cache.get(email);
  if (hit) return hit;
  const admin = createAdminClient();

  // public.users is filled from auth.users by the on_auth_user_created trigger.
  const { data: existing, error } = await admin.from("users").select("id, email").eq("email", email).maybeSingle();
  if (error) throw error;
  if (existing) {
    cache.set(email, existing);
    return existing;
  }

  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: "Dev user" },
  });
  if (createError) throw createError;
  const user = { id: data.user.id, email };
  cache.set(email, user);
  return user;
}
