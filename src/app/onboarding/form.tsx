"use client";

import { useActionState } from "react";
import { buildBrandProfile, type OnboardingState } from "./actions";

export function OnboardingForm({ defaultUrl }: { defaultUrl?: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(buildBrandProfile, { error: null });

  return (
    <form action={action} className="flex flex-col gap-3">
      <input
        name="website"
        defaultValue={defaultUrl}
        required
        placeholder="yourstore.com or a product URL"
        className="rounded border px-3 py-2"
      />
      <button disabled={pending} className="rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-50">
        {pending ? "Reading your site…" : "Build my brand profile"}
      </button>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
