"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { WALL_OF_TEXT, FONT_FAMILIES } from "@/remotion/WallOfText";
import { playerConfig } from "./composition";
import {
  clampProduct,
  clampTextBox,
  PRODUCT_BOUNDS,
  slideImagesFor,
  type MemeLayer,
  type ProductLayer,
  FONT_OPTIONS,
  POSITION_OPTIONS,
  TEXT_SCALE,
  type FontId,
  type TextBox,
  type TextPosition,
} from "@/remotion/style";
import { createClient } from "@/lib/supabase/client";
import type { StockClip } from "@/lib/stock";
import { MEMES, toMemeLayer } from "@/lib/memes";
import type { Upload } from "@/lib/edit";
import { Button, FinePrint, field, fieldLabel } from "@/components/ui";
import {
  footageSuggestions,
  myProductCutouts,
  myUploads,
  requestUpload,
  saveEdit,
  searchFootage,
  smartPosition,
} from "./actions";
import type { StoredCutout } from "@/lib/generate";
import type { PreviewCard } from "./data";

type DoneCard = Extract<PreviewCard, { status: "done" }>;

// Everything here is free: only rendering (approve) costs a credit.
export function CardEditor({ card, onClose, onSaved }: { card: DoneCard; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(card.lines.join("\n"));
  const [font, setFont] = useState<FontId>(card.style.font);
  const [position, setPosition] = useState<TextPosition>(card.style.textPosition);
  const [scale, setScale] = useState(card.style.textScale);
  const [textBox, setTextBox] = useState<TextBox | null>(card.style.textBox);
  // Slideshow photos, in slide order.
  const [slideImages, setSlideImages] = useState<string[]>(slideImagesFor(card.style, card.images));
  const stage = useRef<HTMLDivElement>(null);
  // The product floating over the footage (Wall of Text only).
  const [product, setProduct] = useState<ProductLayer | null>(card.style.product ?? null);
  const [background, setBackground] = useState<StockClip | null>(card.background);
  // The reaction meme (Meme format only).
  const [meme, setMeme] = useState<MemeLayer | null>(card.style.meme ?? null);
  const [saving, setSaving] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // The preview follows typing and the size slider a beat behind, so each
  // keystroke doesn't rebuild the whole video player.
  const previewText = useDeferredValue(text);
  const previewScale = useDeferredValue(scale);
  const previewLines = previewText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Escape closes; the page behind doesn't scroll while the editor is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Moves the text off any faces in the current footage.
  async function autoPlace() {
    if (!background?.frames?.length) return setError("Smart positioning works on library clips, not uploads yet.");
    setPlacing(true);
    setError(null);
    const result = await smartPosition(background.frames, lines, font, scale);
    setPlacing(false);
    if (!result.ok) return setError(result.error);
    if (!result.textBox) return setError("No faces found in this clip, so the text can stay where it is.");
    setTextBox(result.textBox);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveEdit(card.jobId, {
      lines,
      textPosition: position,
      textBox,
      font,
      textScale: scale,
      background,
      slideImages: card.format === "slideshow" ? slideImages : null,
      product: card.format === "wall_of_text" ? product : null,
      memeId: card.format === "green_screen" ? (meme?.id ?? null) : null,
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onSaved();
  }

  return (
    // No backdrop blur: blurring a page of playing videos re-blurs every frame.
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/75 p-0 sm:p-6" role="dialog" aria-modal aria-label="Edit post">
      <div className="flex w-full max-w-6xl flex-col overflow-hidden border-ink bg-paper sm:rounded-2xl sm:border-2 sm:shadow-[6px_6px_0_var(--color-ink)]">
        <header className="flex items-center justify-between gap-4 border-b-2 border-ink px-5 py-3">
          <div>
            <FinePrint>Edits are free · only approving uses a credit</FinePrint>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">Edit post</h2>
          </div>
          <button onClick={onClose} className="rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold hover:bg-paper-deep" aria-label="Close editor">
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:overflow-hidden">
          {/* Live preview: the same composition the final render uses. */}
          <div className="flex flex-col items-center gap-3 border-ink bg-paper-deep/60 p-5 md:border-r-2">
            <div ref={stage} className="relative w-full max-w-[300px] overflow-hidden rounded-2xl border-2 border-ink shadow-[5px_5px_0_var(--color-ink)]">
              <Player
                {...playerConfig(card, {
                  lines: previewLines.length ? previewLines : [" "],
                  style: {
                    textPosition: position, textBox, music: card.style.music, font, textScale: previewScale, slideImages, product,
                    meme, backdrop: card.style.backdrop ?? null,
                  },
                  background,
                })}
                compositionWidth={WALL_OF_TEXT.width}
                compositionHeight={WALL_OF_TEXT.height}
                fps={WALL_OF_TEXT.fps}
                style={{ width: "100%", aspectRatio: "9 / 16", display: "block" }}
                loop
                autoPlay
                initiallyMuted
                clickToPlay={false}
                acknowledgeRemotionLicense
              />
              {product && <ProductHandle stage={stage} product={product} onChange={setProduct} />}
              <TextDragHandle stage={stage} textBox={textBox} onMove={setTextBox} />
            </div>
            <FinePrint className="text-center">
              Drag the text{product ? " or the product; pull the product's corner to resize" : " to move it"}
            </FinePrint>
          </div>

          <div className="space-y-8 p-5 md:overflow-y-auto">
            <section>
              <label htmlFor="edit-text" className={fieldLabel}>
                Text{" "}
                <span className="normal-case tracking-normal text-ink-faint">
                  {card.format === "slideshow" ? "(each line is one slide)" : "(each new line is a line on screen)"}
                </span>
              </label>
              <textarea id="edit-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} className={`${field} text-sm leading-relaxed`} />
            </section>

            <section>
              <p className={fieldLabel}>Font</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {FONT_OPTIONS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFont(f.id)} aria-pressed={font === f.id}
                    className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
                      font === f.id ? "border-ink bg-ink text-paper" : "border-ink/25 bg-card hover:border-ink"
                    }`}>
                    <span className="block text-lg leading-tight" style={{ fontFamily: FONT_FAMILIES[f.id] }}>
                      {f.label}
                    </span>
                    <span className={`block text-[11px] ${font === f.id ? "text-paper/70" : "text-ink-faint"}`}>{f.hint}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className={fieldLabel}>
                    Placement {textBox && <span className="normal-case tracking-normal text-leaf">· custom</span>}
                  </p>
                  {card.format === "wall_of_text" && (
                    <button type="button" onClick={autoPlace} disabled={placing}
                      className="mb-1.5 text-xs font-semibold text-leaf underline decoration-2 underline-offset-4 disabled:opacity-50">
                      {placing ? "Finding faces…" : "Smart position"}
                    </button>
                  )}
                </div>
                {card.format === "slideshow" ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink/20 bg-card px-3 py-2 text-sm">
                    <span className="text-ink-soft">{textBox ? "Where you dragged it" : "Above the photo"}</span>
                    {textBox && (
                      <button type="button" onClick={() => setTextBox(null)} className="font-semibold underline underline-offset-4">
                        Reset
                      </button>
                    )}
                  </div>
                ) : (
                <div className="flex rounded-xl border-2 border-ink bg-card p-1">
                  {POSITION_OPTIONS.map((p) => {
                    const active = !textBox && position === p.id;
                    return (
                    <button key={p.id} type="button" aria-pressed={active}
                      onClick={() => {
                        setPosition(p.id);
                        setTextBox(null);
                      }}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition ${
                        active ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                      }`}>
                      {p.label}
                    </button>
                    );
                  })}
                </div>
                )}
              </div>
              <div>
                <label htmlFor="edit-scale" className={fieldLabel}>
                  Text size · {Math.round(scale * 100)}%
                </label>
                <input id="edit-scale" type="range" min={TEXT_SCALE.min} max={TEXT_SCALE.max} step={0.05} value={scale}
                  onChange={(e) => setScale(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-leaf)]" />
              </div>
            </section>

            {card.format === "wall_of_text" && <ProductPicker product={product} onChange={setProduct} />}

            {card.format === "green_screen" ? (
              <MemePicker current={meme} onPick={setMeme} />
            ) : card.format === "slideshow" ? (
              <PhotoPicker gallery={card.images} selected={slideImages} onChange={setSlideImages}
                productName={card.productName} />
            ) : (
              <FootagePicker current={background} onPick={setBackground} />
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t-2 border-ink px-5 py-3">
          {error && <p className="mr-auto text-sm font-medium text-tomato">{error}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || lines.length === 0}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

// A dashed box drawn over the text in the preview that you can drag, like a
// text box in Paint. It reads the text block's real size from the player's
// DOM, so the box always hugs the text whatever the font, size or length.
function TextDragHandle({
  stage,
  textBox,
  onMove,
}: {
  stage: React.RefObject<HTMLDivElement | null>;
  textBox: TextBox | null;
  onMove: (box: TextBox) => void;
}) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const drag = useRef<{ pointerX: number; pointerY: number; start: TextBox } | null>(null);
  const [dragging, setDragging] = useState(false);

  // The player renders asynchronously (fonts load, text reflows), so poll
  // the text block's box cheaply instead of guessing when it changed.
  useEffect(() => {
    const measure = () => {
      const root = stage.current;
      const text = root?.querySelector<HTMLElement>("[data-text-block]");
      if (!root || !text) return setRect(null);
      const r = root.getBoundingClientRect();
      const t = text.getBoundingClientRect();
      setRect((prev) => {
        const next = { left: t.left - r.left, top: t.top - r.top, width: t.width, height: t.height };
        const same = prev && Object.keys(next).every((k) => Math.abs(prev[k as keyof typeof next] - next[k as keyof typeof next]) < 0.5);
        return same ? prev : next;
      });
    };
    measure();
    const timer = setInterval(measure, 150);
    return () => clearInterval(timer);
  }, [stage]);

  if (!rect) return null;

  function onPointerDown(e: React.PointerEvent) {
    const root = stage.current;
    if (!root || !rect) return;
    const r = root.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      // A preset position has no stored box yet: start from where it is now.
      start: textBox ?? { x: (rect.left + rect.width / 2) / r.width, y: (rect.top + rect.height / 2) / r.height },
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const root = stage.current;
    if (!drag.current || !root) return;
    const r = root.getBoundingClientRect();
    let x = drag.current.start.x + (e.clientX - drag.current.pointerX) / r.width;
    const y = drag.current.start.y + (e.clientY - drag.current.pointerY) / r.height;
    // Snap to the centre line; off-centre by a hair looks like a mistake.
    if (Math.abs(x - 0.5) < 0.05) x = 0.5;
    onMove(clampTextBox({ x, y }));
  }

  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <>
      {dragging && textBox?.x === 0.5 && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-yolk" aria-hidden />
      )}
      <div
        role="button"
        aria-label={`Move text (drag, or use arrow keys). ${
          textBox ? `Now ${Math.round(textBox.x * 100)}% across, ${Math.round(textBox.y * 100)}% down.` : "Now at a preset position."
        }`}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.05 : 0.01;
          const root = stage.current;
          if (!root || !rect) return;
          const r = root.getBoundingClientRect();
          const cur = textBox ?? { x: (rect.left + rect.width / 2) / r.width, y: (rect.top + rect.height / 2) / r.height };
          const moves: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
          const m = moves[e.key];
          if (!m) return;
          e.preventDefault();
          onMove(clampTextBox({ x: cur.x + m[0], y: cur.y + m[1] }));
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, touchAction: "none" }}
        className={`group absolute cursor-move rounded-md border-2 border-dashed outline-none transition-colors ${
          dragging ? "border-yolk bg-yolk/10" : "border-white/80 hover:border-yolk focus-visible:border-yolk"
        }`}
      >
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-ink bg-yolk px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-ink shadow-[1px_1px_0_var(--color-ink)]">
          {dragging ? "Moving" : "Drag"}
        </span>
      </div>
    </>
  );
}

// Slideshow photos from the product's gallery. Tap to add or remove; the
// numbers are the slide order (photos repeat if there are more slides).
function PhotoPicker({ gallery, selected, onChange, productName }: {
  gallery: string[];
  selected: string[];
  onChange: (images: string[]) => void;
  productName: string | null;
}) {
  const toggle = (url: string) =>
    selected.includes(url)
      ? selected.length > 1 && onChange(selected.filter((u) => u !== url))
      : onChange([...selected, url]);

  return (
    <section>
      <p className={fieldLabel}>Photos</p>
      <p className="mb-3 text-sm text-ink-soft">
        From {productName ?? "your product"}. Tap to add or remove; numbers are the slide order. Skip photos that
        already have text on them.
      </p>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {gallery.map((url) => {
          const n = selected.indexOf(url);
          return (
            <li key={url}>
              <button type="button" onClick={() => toggle(url)} aria-pressed={n >= 0}
                aria-label={n >= 0 ? `Photo used on slide ${n + 1}, tap to remove` : "Photo not used, tap to add"}
                className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 bg-card ${
                  n >= 0 ? "border-leaf ring-4 ring-leaf/30" : "border-ink/20 opacity-60 hover:opacity-100"
                }`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                {n >= 0 && (
                  <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-leaf font-mono text-[11px] font-bold text-card">
                    {n + 1}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Footage: search the stock library (with the brand's scenes as quick picks)
// or use the founder's own uploads.
function FootagePicker({ current, onPick }: { current: StockClip | null; onPick: (clip: StockClip) => void }) {
  const [tab, setTab] = useState<"library" | "uploads">(current?.source === "upload" ? "uploads" : "library");

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={fieldLabel}>Background video</p>
          <p className="text-sm text-ink-soft">
            {current
              ? current.source === "upload"
                ? "Your upload"
                : `“${current.query ?? "stock clip"}”${current.credit ? ` · by ${current.credit.name} on Pexels` : ""}`
              : "None"}
          </p>
        </div>
        <div className="flex rounded-full border-2 border-ink bg-card p-0.5 text-sm font-semibold">
          {(["library", "uploads"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
              className={`rounded-full px-3 py-1 ${tab === t ? "bg-ink text-paper" : "text-ink-soft"}`}>
              {t === "library" ? "Library" : "My uploads"}
            </button>
          ))}
        </div>
      </div>
      {tab === "library" ? <LibraryTab current={current} onPick={onPick} /> : <UploadsTab current={current} onPick={onPick} />}
    </section>
  );
}

function LibraryTab({ current, onPick }: { current: StockClip | null; onPick: (clip: StockClip) => void }) {
  const [query, setQuery] = useState(current?.source === "upload" ? "" : current?.query ?? "");
  const [clips, setClips] = useState<StockClip[] | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string) {
    setQuery(q);
    setBusy(true);
    setError(null);
    const result = await searchFootage(q);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setClips(result.clips);
  }

  useEffect(() => {
    footageSuggestions().then(setSuggestions);
  }, []);

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); run(query); }} className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: woman laughing in car, man at gym…"
          className={`${field} text-sm`} aria-label="Search footage" />
        <Button variant="secondary" disabled={busy || !query.trim()} className="shrink-0">
          {busy ? "…" : "Search"}
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => run(s)}
              className="rounded-full border-2 border-ink/20 bg-card px-2.5 py-1 text-xs font-medium hover:border-ink">
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-tomato">{error}</p>}
      {clips && clips.length === 0 && <p className="text-sm text-ink-soft">Nothing vertical for that. Try simpler words.</p>}
      {clips && clips.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {clips.map((clip) => (
            <li key={clip.videoUrl}>
              <ClipTile clip={clip} selected={current?.videoUrl === clip.videoUrl} onPick={() => onPick(clip)} />
            </li>
          ))}
        </ul>
      )}
      <FinePrint>Stock footage from Pexels, free to use in ads</FinePrint>
    </div>
  );
}

// Plays on hover so you can judge motion, not just the first frame.
function ClipTile({ clip, selected, onPick }: { clip: StockClip; selected: boolean; onPick: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  return (
    <button type="button" onClick={onPick} aria-pressed={selected}
      onMouseEnter={() => video.current?.play().catch(() => undefined)}
      onMouseLeave={() => video.current?.pause()}
      className={`relative block aspect-[9/16] w-full overflow-hidden rounded-xl border-2 bg-ink transition ${
        selected ? "border-leaf ring-4 ring-leaf/30" : "border-ink/30 hover:border-ink"
      }`}>
      <video ref={video} src={clip.videoUrl} poster={clip.posterUrl ?? undefined} muted loop playsInline preload="none"
        className="h-full w-full object-cover" />
      {selected && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-leaf px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-card">
          Using
        </span>
      )}
    </button>
  );
}

function UploadsTab({ current, onPick }: { current: StockClip | null; onPick: (clip: StockClip) => void }) {
  const [uploads, setUploads] = useState<Upload[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    myUploads().then(setUploads);
  }, []);

  async function pick(url: string) {
    setError(null);
    setBusy("Reading video…");
    try {
      onPick(await clipFromUrl(url));
    } catch {
      setError("This browser can't play that video. Try an MP4 (H.264).");
    }
    setBusy(null);
  }

  async function upload(file: File) {
    setError(null);
    setBusy("Uploading…");
    const ticket = await requestUpload(file.type, file.size);
    if (!ticket.ok) {
      setBusy(null);
      return setError(ticket.error);
    }
    const { error: uploadError } = await createClient()
      .storage.from("uploads")
      .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
    if (uploadError) {
      setBusy(null);
      return setError(`Upload failed: ${uploadError.message}`);
    }
    setUploads(await myUploads());
    await pick(ticket.publicUrl);
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }} />
      <button type="button" onClick={() => input.current?.click()} disabled={!!busy}
        className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-ink/40 bg-card px-4 py-6 text-center hover:border-ink disabled:opacity-60">
        <span className="font-display text-lg font-extrabold">{busy ?? "Upload a video"}</span>
        <span className="text-xs text-ink-soft">Vertical works best · MP4, MOV or WebM · up to 50 MB</span>
      </button>
      {error && <p className="text-sm text-tomato">{error}</p>}
      {uploads && uploads.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {uploads.map((u) => (
            <li key={u.url}>
              <button type="button" onClick={() => pick(u.url)} aria-pressed={current?.videoUrl === u.url}
                className={`relative block aspect-[9/16] w-full overflow-hidden rounded-xl border-2 bg-ink ${
                  current?.videoUrl === u.url ? "border-leaf ring-4 ring-leaf/30" : "border-ink/30 hover:border-ink"
                }`}>
                <video src={`${u.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FinePrint>Only upload footage you own or have the rights to use in ads</FinePrint>
    </div>
  );
}

// An upload has no stock metadata, so read size and length from the file.
function clipFromUrl(url: string): Promise<StockClip> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () =>
      resolve({
        videoUrl: url,
        renderUrl: url,
        posterUrl: null,
        width: v.videoWidth || 1080,
        height: v.videoHeight || 1920,
        durationSeconds: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 10,
        source: "upload",
        credit: null,
      });
    v.onerror = () => reject(new Error("unreadable"));
    v.src = url;
  });
}

// Product layer controls: show or hide, which product, and size. Moving it
// happens by dragging in the preview.
function ProductPicker({ product, onChange }: { product: ProductLayer | null; onChange: (p: ProductLayer | null) => void }) {
  const [cutouts, setCutouts] = useState<StoredCutout[] | null>(null);
  const lastRef = useRef<ProductLayer | null>(product);

  useEffect(() => {
    myProductCutouts().then(setCutouts);
  }, []);
  useEffect(() => {
    if (product) lastRef.current = product;
  }, [product]);

  const use = (c: StoredCutout) =>
    onChange(
      clampProduct({
        url: c.url,
        aspect: c.width / c.height,
        // Keep the current spot and size when swapping products.
        x: product?.x ?? lastRef.current?.x ?? 0.7,
        y: product?.y ?? lastRef.current?.y ?? 0.62,
        width: product?.width ?? lastRef.current?.width ?? 0.36,
      }),
    );

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className={fieldLabel}>Product in the shot</p>
        {product && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-ink-soft underline underline-offset-4">
            Hide product
          </button>
        )}
      </div>
      {cutouts === null ? (
        <p className="text-sm text-ink-soft">Loading your products…</p>
      ) : cutouts.length === 0 ? (
        <p className="text-sm text-ink-soft">
          None of your product photos has a plain background to cut out. Clean packshots on white work best.
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {cutouts.map((c) => (
              <li key={c.url}>
                <button type="button" onClick={() => use(c)} aria-pressed={product?.url === c.url} title={c.productName}
                  className={`grid size-20 place-items-center rounded-xl border-2 bg-[repeating-conic-gradient(#e8dcc7_0_25%,#fbf8f2_0_50%)] bg-[length:14px_14px] p-1.5 ${
                    product?.url === c.url ? "border-leaf ring-4 ring-leaf/30" : "border-ink/20 hover:border-ink"
                  }`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt={c.productName} className="max-h-full max-w-full object-contain" />
                </button>
              </li>
            ))}
          </ul>
          {product && (
            <div className="mt-3">
              <label htmlFor="product-size" className={fieldLabel}>
                Size · {Math.round(product.width * 100)}% of the width
              </label>
              <input id="product-size" type="range" min={PRODUCT_BOUNDS.width[0]} max={PRODUCT_BOUNDS.width[1]} step={0.01}
                value={product.width} onChange={(e) => onChange(clampProduct({ ...product, width: Number(e.target.value) }))}
                className="w-full accent-[var(--color-leaf)]" />
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Drag the product anywhere on the preview; drag its corner to resize,
// like a layer in a design tool. Reads the layer's real box from the
// player's DOM so the handle always fits it.
function ProductHandle({ stage, product, onChange }: {
  stage: React.RefObject<HTMLDivElement | null>;
  product: ProductLayer;
  onChange: (p: ProductLayer) => void;
}) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; start: ProductLayer } | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const measure = () => {
      const root = stage.current;
      const el = root?.querySelector<HTMLElement>("[data-product-layer]");
      if (!root || !el) return setRect(null);
      const r = root.getBoundingClientRect();
      const t = el.getBoundingClientRect();
      setRect((prev) => {
        const next = { left: t.left - r.left, top: t.top - r.top, width: t.width, height: t.height };
        const same = prev && Object.keys(next).every((k) => Math.abs(prev[k as keyof typeof next] - next[k as keyof typeof next]) < 0.5);
        return same ? prev : next;
      });
    };
    measure();
    const timer = setInterval(measure, 150);
    return () => clearInterval(timer);
  }, [stage]);

  if (!rect) return null;

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: product };
    setActive(true);
  }
  const startMove = (e: React.PointerEvent) => begin("move", e);
  const startResize = (e: React.PointerEvent) => begin("resize", e);
  const move = (e: React.PointerEvent) => {
    const root = stage.current;
    if (!drag.current || !root) return;
    const r = root.getBoundingClientRect();
    const dx = (e.clientX - drag.current.x) / r.width;
    const dy = (e.clientY - drag.current.y) / r.height;
    const s = drag.current.start;
    onChange(
      clampProduct(
        drag.current.mode === "move"
          ? { ...s, x: s.x + dx, y: s.y + dy }
          : // Resizing from the corner grows both ways around the centre.
            { ...s, width: s.width + dx * 2 },
      ),
    );
  };
  const end = (e: React.PointerEvent) => {
    drag.current = null;
    setActive(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      role="button"
      aria-label="Move the product (drag). Drag the corner to resize."
      tabIndex={0}
      onPointerDown={startMove}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, touchAction: "none" }}
      className={`absolute cursor-move rounded-md border-2 border-dashed ${active ? "border-yolk bg-yolk/10" : "border-white/70 hover:border-yolk"}`}
    >
      <span
        onPointerDown={startResize}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-hidden
        className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-sm border-2 border-ink bg-yolk"
      />
    </div>
  );
}

// The reaction meme under the text. The library is small and static, so
// it's bundled rather than fetched.
function MemePicker({ current, onPick }: { current: MemeLayer | null; onPick: (m: MemeLayer) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = MEMES.filter((m) => !q || `${m.name} ${m.mood} ${m.useWhen} ${m.quote ?? ""}`.toLowerCase().includes(q));
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className={fieldLabel}>Reaction meme {current && <span className="normal-case tracking-normal text-ink-soft">· {current.name}</span>}</p>
      </div>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: shocked, again, laugh, stop…"
        className={`${field} mb-3 text-sm`} />
      <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
        {shown.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onPick(toMemeLayer(m))} aria-pressed={current?.id === m.id} title={`${m.name}: ${m.useWhen}`}
              className={`flex w-full flex-col items-center gap-1 rounded-xl border-2 bg-[#7a3fa0] p-1.5 text-left ${
                current?.id === m.id ? "border-leaf ring-4 ring-leaf/30" : "border-ink/20 hover:border-ink"
              }`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.poster} alt="" loading="lazy" className="aspect-square w-full object-contain" />
              <span className="line-clamp-1 w-full rounded bg-card px-1 text-[11px] font-semibold">{m.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
