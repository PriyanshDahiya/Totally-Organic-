import "server-only";
import { createAdminClient } from "./supabase/admin";

// Credits are spent only when new media is rendered (approve), never for
// generating, editing or rejecting cards.
export const RENDER_COST = 1;

// Atomic: the SQL function only deducts if the balance covers it, so parallel
// approvals can't overspend. Returns false when the user is out of credits.
export async function spendCredits(userId: string, amount: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("spend_credits", { p_user_id: userId, p_amount: amount });
  if (error) throw error;
  return data === true;
}

export async function refundCredits(userId: string, amount: number): Promise<void> {
  const { error } = await createAdminClient().rpc("refund_credits", { p_user_id: userId, p_amount: amount });
  if (error) throw error;
}
