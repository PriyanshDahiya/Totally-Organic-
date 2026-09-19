"use client";

import { useActionState } from "react";
import { Button, field, fieldLabel } from "@/components/ui";
import { buildBrandProfile, type OnboardingState } from "./actions";

export function OnboardingForm({ defaultUrl }: { defaultUrl?: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(buildBrandProfile, { error: null });

  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <label htmlFor="website" className={fieldLabel}>
          Your website
        </label>
        <input id="website" name="website" defaultValue={defaultUrl} required
          placeholder="yourstore.com or a product URL" className={`${field} text-lg`} />
      </div>
      <div>
        <label htmlFor="about" className={fieldLabel}>
          About your brand <span className="normal-case tracking-normal text-ink-faint">(optional)</span>
        </label>
        <textarea id="about" name="about" rows={3} maxLength={2000}
          placeholder="What you sell, who buys it, what makes you different"
          className={field} />
      </div>
      <Button disabled={pending} className="py-3 text-lg">
        {pending ? "Reading your site… (about 20 seconds)" : "Grow my brand label →"}
      </Button>
      {state.error && (
        <p className="rounded-lg border-2 border-tomato bg-tomato-wash px-4 py-3 text-sm font-medium text-ink">
          {state.error}
        </p>
      )}
    </form>
  );
}
