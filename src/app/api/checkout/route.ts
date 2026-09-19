import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

// Creates a Lemon Squeezy checkout for the one paid plan and redirects to it.
// The user id rides along as custom data so the webhook knows whom to credit.
// https://docs.lemonsqueezy.com/api/checkouts/create-checkout
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();

  const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: { redirect_url: new URL("/dashboard?checkout=success", request.url).toString() },
          checkout_data: { email: me.email, custom: { user_id: me.id } },
        },
        relationships: {
          store: { data: { type: "stores", id: process.env.LEMON_SQUEEZY_STORE_ID } },
          variant: { data: { type: "variants", id: process.env.LEMON_SQUEEZY_VARIANT_ID } },
        },
      },
    }),
  });

  if (!res.ok) {
    console.error("checkout failed", res.status, await res.text());
    return NextResponse.redirect(new URL("/dashboard?checkout=error", request.url), { status: 303 });
  }

  const { data } = (await res.json()) as { data: { attributes: { url: string } } };
  return NextResponse.redirect(data.attributes.url, { status: 303 });
}
