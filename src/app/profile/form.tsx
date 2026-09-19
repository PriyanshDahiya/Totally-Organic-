"use client";

import { useActionState, useState } from "react";
import { Button, Panel, field as fieldBase, fieldLabel } from "@/components/ui";
import { findCustomerPhrases, saveProfile, type ProfileEdit, type ProfileEditState } from "./actions";
import { CULTURE_OPTIONS, LANGUAGE_OPTIONS, MAX_EXAMPLES, type BrandVoice } from "@/lib/voice";

type Initial = Omit<ProfileEdit, "mention_frequency" | "voice"> & {
  mention_frequency: "rarely" | "sometimes" | "often";
  voice: BrandVoice;
};

// fieldBase is full-width; `field` is for inputs that share a row.
const input = `${fieldBase} text-sm`;
const field = input.replace("w-full ", "");
const label = fieldLabel;
const section = "space-y-4 p-5 sm:p-6";
const heading = "font-display text-2xl font-extrabold tracking-tight";

export function ProfileForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState<ProfileEditState, FormData>(saveProfile, { error: null });
  const [identity, setIdentity] = useState(initial.identity);
  const [angles, setAngles] = useState(initial.angles);
  const [segments, setSegments] = useState(initial.segments);
  // Lists are edited as plain text and split on submit.
  const [toneDos, setToneDos] = useState(initial.tone_dos.join("\n"));
  const [toneDonts, setToneDonts] = useState(initial.tone_donts.join("\n"));
  const [tags, setTags] = useState(initial.niche_tags.join(", "));
  const [mention, setMention] = useState(initial.mention_frequency);
  const [language, setLanguage] = useState(initial.voice.language);
  const [culture, setCulture] = useState(initial.voice.culture);
  // Example posts are separated by a blank line.
  const [examples, setExamples] = useState(initial.voice.examples.join("\n\n"));
  const [phrases, setPhrases] = useState(initial.voice.customerPhrases);

  const total = segments.reduce((sum, s) => sum + (Number.isFinite(s.share_percent) ? s.share_percent : 0), 0);
  const data = JSON.stringify({
    identity,
    angles,
    segments,
    tone_dos: toneDos.split("\n"),
    tone_donts: toneDonts.split("\n"),
    niche_tags: tags.split(","),
    mention_frequency: mention,
    voice: { language, culture, examples: examples.split(/\n\s*\n/), customerPhrases: phrases },
  });

  const setAngle = (i: number, patch: Partial<Initial["angles"][number]>) =>
    setAngles((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setSegment = (i: number, patch: Partial<Initial["segments"][number]>) =>
    setSegments((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="data" value={data} />

      <Panel className={section}>
        <h2 className={heading}>Brand</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="name">Name</label>
            <input id="name" className={input} value={identity.name}
              onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="category">Category</label>
            <input id="category" className={input} value={identity.category}
              onChange={(e) => setIdentity({ ...identity, category: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="one_liner">What you sell, in one sentence</label>
          <input id="one_liner" className={input} value={identity.one_liner}
            onChange={(e) => setIdentity({ ...identity, one_liner: e.target.value })} />
        </div>
      </Panel>

      <Panel className={section}>
        <div>
          <h2 className={heading}>Content angles</h2>
          <p className="text-sm text-ink-soft">The three pain points every post is written around, and what your product changes for each.</p>
        </div>
        {angles.map((a, i) => (
          <div key={i} className="space-y-2 rounded-xl border-2 border-dashed border-ink/30 p-4">
            <input aria-label={`Angle ${i + 1} title`} className={`${input} font-medium`} value={a.title}
              onChange={(e) => setAngle(i, { title: e.target.value })} />
            <textarea aria-label={`Angle ${i + 1} pain point`} rows={2} className={input} value={a.pain_point}
              onChange={(e) => setAngle(i, { pain_point: e.target.value })} />
            <textarea aria-label={`Angle ${i + 1} benefit`} rows={2} className={input} value={a.benefit ?? ""}
              placeholder="What your product changes here, e.g. Reels every day without hiring anyone"
              onChange={(e) => setAngle(i, { benefit: e.target.value })} />
            <input aria-label={`Angle ${i + 1} example hook`} className={`${input} italic`} value={a.example_hook}
              onChange={(e) => setAngle(i, { example_hook: e.target.value })} />
          </div>
        ))}
      </Panel>

      <Panel className={section}>
        <div className="flex items-baseline justify-between">
          <h2 className={heading}>Customers</h2>
          <span className={`font-mono text-sm font-bold ${total === 100 ? "text-leaf" : "text-tomato"}`}>
            Total {total}%
          </span>
        </div>
        {segments.map((s, i) => (
          <div key={i} className="space-y-2 rounded-xl border-2 border-dashed border-ink/30 p-3">
            <div className="flex items-center gap-2">
              <input aria-label={`Segment ${i + 1} name`} className={`${field} min-w-0 flex-1`} value={s.name}
                onChange={(e) => setSegment(i, { name: e.target.value })} />
              <input aria-label={`Segment ${i + 1} share`} type="number" min={0} max={100}
                className={`${field} w-20`} value={Number.isFinite(s.share_percent) ? s.share_percent : ""}
                onChange={(e) => setSegment(i, { share_percent: e.target.valueAsNumber })} />
              <span className="font-mono text-sm text-ink-soft">%</span>
              <button type="button" disabled={segments.length === 1}
                onClick={() => setSegments(segments.filter((_, j) => j !== i))}
                className="ml-2 text-sm text-ink-soft underline decoration-2 underline-offset-4 hover:text-tomato disabled:opacity-30">
                Remove
              </button>
            </div>
            <textarea aria-label={`Segment ${i + 1} description`} rows={2} className={input} value={s.description}
              onChange={(e) => setSegment(i, { description: e.target.value })} />
          </div>
        ))}
        {segments.length < 4 && (
          <button type="button" className="text-sm font-semibold text-leaf underline decoration-2 underline-offset-4"
            onClick={() => setSegments([...segments, { name: "", share_percent: Math.max(0, 100 - total), description: "" }])}>
            + Add segment
          </button>
        )}
      </Panel>

      <Panel className={`${section} grid gap-6 space-y-0 sm:grid-cols-2`}>
        <div>
          <label className={label} htmlFor="tone_dos">Tone: do (one per line)</label>
          <textarea id="tone_dos" rows={5} className={input} value={toneDos} onChange={(e) => setToneDos(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="tone_donts">Tone: don&apos;t (one per line)</label>
          <textarea id="tone_donts" rows={5} className={input} value={toneDonts} onChange={(e) => setToneDonts(e.target.value)} />
        </div>
      </Panel>

      <Panel className={`${section} grid gap-6 space-y-0 sm:grid-cols-2`}>
        <div>
          <label className={label} htmlFor="tags">Niche tags (comma separated)</label>
          <input id="tags" className={input} value={tags} onChange={(e) => setTags(e.target.value)} />
          <p className="mt-1.5 text-xs text-ink-soft">Used to pick which trending posts we remix for you.</p>
        </div>
        <div>
          <label className={label} htmlFor="mention">How often posts mention your brand</label>
          <select id="mention" className={input} value={mention}
            onChange={(e) => setMention(e.target.value as Initial["mention_frequency"])}>
            <option value="rarely">Rarely</option>
            <option value="sometimes">Sometimes</option>
            <option value="often">Often</option>
          </select>
        </div>
      </Panel>

      <Panel className={section}>
        <div>
          <h2 className={heading}>Voice</h2>
          <p className="text-sm text-ink-soft">How your posts should sound, and who they&apos;re for.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Choice label="Language" options={LANGUAGE_OPTIONS} value={language} onChange={setLanguage} />
          <Choice label="References" options={CULTURE_OPTIONS} value={culture} onChange={setCulture} />
        </div>
        <div>
          <label className={label} htmlFor="examples">
            Posts you love <span className="normal-case tracking-normal text-ink-faint">(up to {MAX_EXAMPLES}, blank line between each)</span>
          </label>
          <textarea id="examples" rows={5} className={input} value={examples} onChange={(e) => setExamples(e.target.value)}
            placeholder={"Paste the text of posts whose voice you like, yours or anyone's.\n\nWe match their rhythm and humour, we never copy them."} />
        </div>
        <CustomerVoice phrases={phrases} onChange={setPhrases} />
      </Panel>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-ink bg-paper p-3">
        <Button disabled={pending}>{pending ? "Saving…" : "Save label"}</Button>
        {state.error && <p className="text-sm font-medium text-tomato">{state.error}</p>}
      </div>
    </form>
  );
}

function Choice<T extends string>({ label: title, options, value, onChange }: {
  label: string;
  options: { id: T; label: string; hint: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className={label}>{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
            className={`rounded-xl border-2 px-3 py-2 text-left transition ${
              value === o.id ? "border-ink bg-ink text-paper" : "border-ink/25 bg-card hover:border-ink"
            }`}>
            <span className="block text-sm font-semibold">{o.label}</span>
            <span className={`block text-[11px] ${value === o.id ? "text-paper/70" : "text-ink-faint"}`}>{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Real customer wording: paste reviews, we keep only exact quotes worth
// echoing. The founder can remove any before saving.
function CustomerVoice({ phrases, onChange }: { phrases: string[]; onChange: (p: string[]) => void }) {
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    const result = await findCustomerPhrases(pasted);
    setBusy(false);
    if (!result.ok) return setNote(result.error);
    const merged = [...new Set([...phrases, ...result.phrases])];
    onChange(merged);
    setNote(
      result.phrases.length
        ? `Added ${result.phrases.length} phrases${result.fromStore ? ` (also read ${result.fromStore} reviews from your store)` : ""}. Save the label to keep them.`
        : "Nothing vivid enough to reuse. Reviews with specific, emotional wording work best.",
    );
    if (result.phrases.length) setPasted("");
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-ink/30 p-4">
      <div>
        <p className="font-semibold">Your customers&apos; words</p>
        <p className="text-sm text-ink-soft">
          Paste real reviews, comments or DMs (export them from your review app or Amazon). We keep only exact quotes
          worth echoing, and posts reuse them. Nothing is made up.
        </p>
      </div>
      <textarea rows={4} className={input} value={pasted} onChange={(e) => setPasted(e.target.value)}
        placeholder="One review per line" aria-label="Paste customer reviews" />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={run} disabled={busy} className="px-3 py-2 text-sm">
          {busy ? "Reading reviews…" : "Find customer phrases"}
        </Button>
        {note && <p className="text-sm text-ink-soft">{note}</p>}
      </div>
      {phrases.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {phrases.map((p) => (
            <li key={p} className="flex items-center gap-2 rounded-full border-2 border-ink/20 bg-card py-1 pl-3 pr-1 text-sm">
              <span className="italic">&ldquo;{p}&rdquo;</span>
              <button type="button" onClick={() => onChange(phrases.filter((x) => x !== p))} aria-label={`Remove "${p}"`}
                className="grid size-6 place-items-center rounded-full text-ink-soft hover:bg-tomato-wash hover:text-tomato">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
