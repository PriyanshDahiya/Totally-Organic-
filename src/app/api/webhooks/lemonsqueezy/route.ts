import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PLAN = "pro";

type WebhookPayload = {
  meta: { event_name: string; custom_data?: { user_id?: string } };
  data: { type: string; id: string };
};

function validSignature(rawBody: string, signature: string | null) {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = Buffer.from(crypto.createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");
  const received = Buffer.from(signature, "utf8");
  return digest.length === received.length && crypto.timingSafeEqual(digest, received);
}

// https://docs.lemonsqueezy.com/help/webhooks
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const { meta, data } = JSON.parse(rawBody) as WebhookPayload;
  const userId = meta.custom_data?.user_id;
  if (!userId) return NextResponse.json({ ignored: "no user_id" });

  const admin = createAdminClient();

  switch (meta.event_name) {
    // Fires for the first charge and every renewal, so each billing period
    // grants the plan's credits once. subscription_created is ignored to
    // avoid double-granting the first period.
    case "subscription_payment_success": {
      const { error } = await admin.rpc("grant_credits", {
        p_user_id: userId,
        p_plan: PLAN,
        p_credits: Number(process.env.PLAN_MONTHLY_CREDITS ?? 100),
        p_billing_event_id: `${meta.event_name}:${data.id}`,
      });
      if (error) {
        console.error("grant_credits failed", error);
        return NextResponse.json({ error: "grant failed" }, { status: 500 }); // Lemon Squeezy retries
      }
      break;
    }
    case "subscription_expired": {
      const { error } = await admin.from("users").update({ plan: "free" }).eq("id", userId);
      if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
