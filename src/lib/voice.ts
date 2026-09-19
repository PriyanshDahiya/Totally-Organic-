// How a brand's posts should sound: stored in brands.profile.voice.
// Shared by the server (prompts) and the label editor (form), so no
// server-only imports here.

export type Language = "english" | "hinglish" | "mixed";
export type Culture = "india" | "global";

export type BrandVoice = {
  // English, Hinglish (Hindi in Latin script mixed with English), or a mix
  // across posts.
  language: Language;
  // Which everyday moments and references the jokes draw on.
  culture: Culture;
  // Posts the founder loves (theirs or anyone's), used as style examples.
  examples: string[];
  // How real customers talk, pulled from reviews: short quotes, verbatim.
  customerPhrases: string[];
};

export const DEFAULT_VOICE: BrandVoice = { language: "english", culture: "india", examples: [], customerPhrases: [] };

export function voiceOf(profile: { voice?: Partial<BrandVoice> } | null | undefined): BrandVoice {
  return { ...DEFAULT_VOICE, ...(profile?.voice ?? {}) };
}

export const LANGUAGE_OPTIONS: { id: Language; label: string; hint: string }[] = [
  { id: "english", label: "English", hint: "Plain English posts" },
  { id: "hinglish", label: "Hinglish", hint: "“Mummy ne bola tha…” style" },
  { id: "mixed", label: "Mix", hint: "Some of each" },
];

export const CULTURE_OPTIONS: { id: Culture; label: string; hint: string }[] = [
  { id: "india", label: "Indian", hint: "Chai, mummy, board exams, salary day" },
  { id: "global", label: "Global", hint: "No country-specific references" },
];

export const MAX_EXAMPLES = 5;
export const MAX_CUSTOMER_PHRASES = 15;
