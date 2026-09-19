import { NextResponse, type NextRequest } from "next/server";
import { DEV_USER_COOKIE, isTestAccount } from "@/lib/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

// Dev-only: /dev/switch?as=bombay switches this browser to the first local
// test account whose brand website matches "bombay" (or ?as=<email>), and
// /dev/switch with no "as" goes back to the default account. The choice is a
// cookie, so it only affects this browser and host.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });

  const as = request.nextUrl.searchParams.get("as")?.trim().toLowerCase() ?? "";
  // Redirect on the host the browser used (request.url is normalised to
  // localhost), since the cookie only exists on that host.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const res = NextResponse.redirect(new URL("/cards", `${request.nextUrl.protocol}//${host}`));
  if (!as) {
    res.cookies.delete(DEV_USER_COOKIE);
    return res;
  }

  let email = as.includes("@") ? as : null;
  if (!email) {
    const { data } = await createAdminClient()
      .from("brands")
      .select("website_url, users!inner(email)")
      .ilike("website_url", `%${as}%`)
      .limit(1)
      .maybeSingle();
    email = (data?.users as unknown as { email: string } | null)?.email ?? null;
  }
  if (!email || !isTestAccount(email)) return new NextResponse(`No local test account matches "${as}".`, { status: 404 });

  res.cookies.set(DEV_USER_COOKIE, email, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
