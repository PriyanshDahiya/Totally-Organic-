import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Login is switched off for now: every request acts as a dev account.
// Callers use the service-role client, so RLS is bypassed; always filter by
// user.id explicitly. To bring login back, swap this for supabase.auth.getUser()
// and the RLS client again (see git history before this file existed).
const DEFAULT_EMAIL = process.env.DEV_USER_EMAIL || "dev@d2c-content-engine.local";

// Dev-only account switcher (/dev/switch): a cookie picks one of the local
// test accounts, so different browser tabs/hosts can look at different brands.
export const DEV_USER_COOKIE = "dev_user";
const TEST_DOMAIN = "@d2c-content-engine.local";

export function isTestAccount(email: string) {
  return email.endsWith(TEST_DOMAIN) && !email.includes("/");
}

async function currentEmail() {
  if (process.env.NODE_ENV === "production") return DEFAULT_EMAIL;
  try {
    const picked = (await cookies()).get(DEV_USER_COOKIE)?.value;
    return picked && isTestAccount(picked) ? picked : DEFAULT_EMAIL;
  } catch {
    // Outside a request (scripts): no cookies.
    return DEFAULT_EMAIL;
  }
}

const cache = new Map<string, { id: string; email: string }>();

export async function getCurrentUser(): Promise<{ id: string; email: string }> {
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
