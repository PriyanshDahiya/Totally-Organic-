"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Player, type PlayerRef } from "@remotion/player";
import { WALL_OF_TEXT } from "@/remotion/WallOfText";
import { playerConfig } from "./composition";
import { Button, FinePrint, Stamp, Sticker } from "@/components/ui";
import { approveCard, createPreviewCard, getCredits, refreshCard, rejectCard } from "./actions";
import { CardEditor } from "./card-editor";
import { SwipeDeck } from "./swipe-deck";
import type { PreviewCard } from "./data";

type Slot = { key: string; card: PreviewCard | null };
export type DoneCard = Extract<PreviewCard, { status: "done" }>;

// Generated one at a time: Groq's free tier caps tokens per minute, so a
// parallel burst would just queue up (or fail) anyway.
const BATCH = 3;
const POLL_MS = 4000;

// A short, stable label per card, like a batch code on produce.
const batchCode = (jobId: string) => jobId.slice(0, 4).toUpperCase();

export function CardList({ initialCards, initialCredits }: { initialCards: PreviewCard[]; initialCredits: number }) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    initialCards.map((card, i) => ({ key: card.jobId ?? `saved-${i}`, card })),
  );
  const [credits, setCredits] = useState(initialCredits);
  const [busy, setBusy] = useState(false);
  // `busy` only disables the button after a re-render, so a fast double click
  // could start two batches; the ref blocks that synchronously.
  const running = useRef(false);
  // While the editor is open, every video on the page pauses so the editor's
  // preview gets the whole machine.
  const [editorOpen, setEditorOpen] = useState(false);
  // Auto-refill stops after a batch that entirely failed (e.g. the AI is
  // rate-limited), so a problem doesn't turn into an endless retry loop.
  const [autoRefill, setAutoRefill] = useState(true);

  const generate = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let failures = 0;
    for (let i = 0; i < BATCH; i++) {
      const key = `new-${Date.now()}-${i}`;
      // New cards join the back of the deck, so the card in front never
      // changes under the founder's thumb.
      setSlots((s) => [...s, { key, card: null }]);
      const card = await createPreviewCard();
      if (card.status === "failed") failures++;
      setSlots((s) => s.map((slot) => (slot.key === key ? { key, card } : slot)));
    }
    setAutoRefill(failures < BATCH);
    running.current = false;
    setBusy(false);
  }, []);

  const update = useCallback((key: string, card: PreviewCard | null) => {
    setSlots((s) => (card ? s.map((slot) => (slot.key === key ? { key, card } : slot)) : s.filter((slot) => slot.key !== key)));
    // A render can finish (or fail and refund) in the background, so resync.
    getCredits().then(setCredits);
  }, []);

  // Latest slots for callbacks that run later (after an edit is saved).
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  const refresh = useCallback(async (key: string) => {
    const slot = slotsRef.current.find((s) => s.key === key);
    if (slot?.card?.jobId) update(key, await refreshCard(slot.card.jobId));
  }, [update]);

  // The deck: cards still waiting for a decision (and ones still growing).
  const deck = slots.filter(
    ({ card }) => !card || card.status !== "done" || card.reviewStatus === "pending",
  );
  const approved = slots.filter(({ card }) => card?.status === "done" && card.reviewStatus === "approved");
  const ready = deck.filter(({ card }) => card?.status === "done").length;

  // Keep a couple of cards ready so swiping never waits.
  useEffect(() => {
    if (autoRefill && !running.current && ready < 2) void generate();
  }, [ready, autoRefill, generate]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-ink bg-card p-3 pl-4 shadow-[4px_4px_0_var(--color-ink)]">
        <Button onClick={() => { setAutoRefill(true); void generate(); }} disabled={busy} className="px-5">
          {busy ? "Growing…" : `Grow ${BATCH} more`}
        </Button>
        <p className="text-sm text-ink-soft">
          <span className="font-display text-lg font-extrabold text-ink">{credits}</span>{" "}
          {credits === 1 ? "credit" : "credits"} left · {ready} ready to swipe. Skipping is free; approving renders the
          video for 1 credit.
        </p>
      </div>

      <SwipeDeck
        items={deck}
        onDecided={update}
        onDismissFailed={(key) => setSlots((s) => s.filter((slot) => slot.key !== key))}
        onRefreshed={refresh}
        onEditorChange={setEditorOpen}
        growing={busy}
        onGrow={() => { setAutoRefill(true); void generate(); }}
      />

      {approved.length > 0 && (
        <section className="space-y-6 border-t-2 border-dashed border-ink/30 pt-10">
          <div>
            <FinePrint>Approved</FinePrint>
            <h2 className="font-display text-3xl font-extrabold tracking-tight">Your videos</h2>
          </div>
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {approved.map(({ key, card }) => (
              <li key={key}>
                <CardView card={card as DoneCard} onChange={(c) => update(key, c)} paused={editorOpen} onEditorChange={setEditorOpen} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// onChange(null) removes the card from the feed (rejected).
function CardView({
  card,
  onChange,
  paused,
  onEditorChange,
}: {
  card: DoneCard;
  onChange: (card: PreviewCard | null) => void;
  paused: boolean;
  onEditorChange: (open: boolean) => void;
}) {
  const [acting, setActing] = useState(false);
  const [editing, setEditingState] = useState(false);
  const setEditing = (open: boolean) => {
    setEditingState(open);
    onEditorChange(open);
  };
  const [error, setError] = useState<string | null>(null);
  const rendering = card.renderStatus === "rendering";
  const rendered = card.renderStatus === "rendered" && card.videoUrl;

  useEffect(() => {
    if (!rendering) return;
    const timer = setInterval(async () => {
      const fresh = await refreshCard(card.jobId);
      if (fresh.status !== "done" || fresh.renderStatus !== "rendering") onChange(fresh);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [rendering, card.jobId, onChange]);

  async function act(kind: "approve" | "reject") {
    if (!card.videoAssetId || acting) return;
    setActing(true);
    setError(null);
    const result = kind === "approve" ? await approveCard(card.videoAssetId) : await rejectCard(card.videoAssetId);
    setActing(false);
    if (!result.ok) return setError(result.error);
    onChange(kind === "reject" ? null : { ...card, reviewStatus: "approved", renderStatus: "rendering" });
  }

  return (
    <article className="space-y-4">
      <div className="relative">
        <Sticker tone={rendered ? "leaf" : "card"} rotate={-4} className="absolute -left-3 -top-3 z-10">
          {rendered ? "Shipped" : `${card.format === "slideshow" ? "Slideshow" : card.format === "green_screen" ? "Meme" : "Batch"} ${batchCode(card.jobId)}`}
        </Sticker>
        {rendered && (
          <Stamp top="READY FOR" center="REELS" bottom="1080 × 1920" tone="leaf" size={78} rotate={12}
            className="absolute -right-4 -top-5 z-10" />
        )}
        <div className={`overflow-hidden rounded-2xl border-2 border-ink shadow-[5px_5px_0_var(--color-ink)] ${rendering ? "opacity-80" : ""}`}>
          <CardMedia card={card} paused={paused || editing} />
        </div>
      </div>

      <Status card={card} acting={acting} onApprove={() => act("approve")} onReject={() => act("reject")}
        onEdit={() => setEditing(true)} />
      {editing &&
        // Rendered at the body so it isn't laid out (or restyled) with the grid.
        createPortal(
          <CardEditor
            card={card}
            onClose={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false);
              onChange(await refreshCard(card.jobId));
            }}
          />,
          document.body,
        )}
      {error && <p className="text-sm font-medium text-tomato">{error}</p>}

      <CardDetails card={card} />
    </article>
  );
}

// "Why it works" plus the collapsible ingredients list, shared by the swipe
// deck and the approved grid.
export function CardDetails({ card }: { card: DoneCard }) {
  const audio = card.suggestedAudio;
  return (
    <>
      {audio && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Trending audio</span>
          <span className="font-semibold">
            {audio.title}
            {audio.artist && <span className="font-normal text-ink-soft"> · {audio.artist}</span>}
          </span>
          <a href={audio.url} target="_blank" rel="noreferrer" className="font-semibold text-leaf underline decoration-2 underline-offset-2">
            Open in Instagram ↗
          </a>
        </p>
      )}
      {card.why && (
        <p className="border-l-4 border-yolk pl-3 text-sm leading-relaxed">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Why it works </span>
          {card.why}
        </p>
      )}

      <details className="group rounded-xl border-2 border-ink/20 bg-card/60 px-3 py-2 text-sm open:border-ink/40">
        <summary className="cursor-pointer list-none font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
          <span className="inline-block transition group-open:rotate-90">▸</span> Ingredients: caption, hook, footage
        </summary>
        <dl className="mt-3 space-y-2.5 pb-1">
          <Row label="Caption">
            <span className="whitespace-pre-line">{card.caption}</span>
          </Row>
          <Row label="Remixed hook">{card.hook}</Row>
          <Row label="Angle">{card.angle}</Row>
          {card.format === "green_screen" && (
            <Row label="Meme">
              {card.style.meme?.name ?? "none"}
              {card.style.backdrop?.credit && (
                <>
                  {" "}· photo by{" "}
                  <a href={card.style.backdrop.credit.pexelsUrl} target="_blank" rel="noreferrer" className="underline decoration-2 underline-offset-2">
                    {card.style.backdrop.credit.name}
                  </a>
                </>
              )}
            </Row>
          )}
          {card.format === "slideshow" && <Row label="Photos">{card.productName ?? "Product"} ({card.images.length})</Row>}
          {card.format === "wall_of_text" && <Row label="Footage">
            {card.background?.source === "upload" ? (
              "your upload"
            ) : card.background?.credit ? (
              <>
                by{" "}
                <a href={card.background.credit.url} target="_blank" rel="noreferrer" className="underline decoration-2 underline-offset-2">
                  {card.background.credit.name}
                </a>{" "}
                on{" "}
                <a href={card.background.credit.pexelsUrl} target="_blank" rel="noreferrer" className="underline decoration-2 underline-offset-2">
                  Pexels
                </a>
                {card.background.emotion && <> · picked for a {card.background.emotion} feel</>}
              </>
            ) : (
              "none found"
            )}
          </Row>}
          <Row label="Music">
            {card.style.music
              ? `${card.style.music.title}${card.style.music.credit ? ` by ${card.style.music.credit}` : ""}`
              : "none (library is empty)"}
          </Row>
        </dl>
      </details>
    </>
  );
}

// Tracks whether an element is on screen (`visible`) and whether it's close
// enough to be worth mounting a video player for (`near`).
function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState({ near: false, visible: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const near = new IntersectionObserver(([e]) => setState((s) => ({ ...s, near: e.isIntersecting })), {
      rootMargin: "600px 0px",
    });
    const visible = new IntersectionObserver(([e]) => setState((s) => ({ ...s, visible: e.isIntersecting })), {
      threshold: 0.35,
    });
    near.observe(el);
    visible.observe(el);
    return () => {
      near.disconnect();
      visible.disconnect();
    };
  }, [ref]);
  return state;
}

// Only cards on screen play. With ~30 cards each looping a video (and the
// editor's own preview on top), playing everything at once is what made the
// page lag. Cards far off screen show a still frame instead of a player.
export function CardMedia({ card, paused }: { card: DoneCard; paused: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerRef>(null);
  const video = useRef<HTMLVideoElement>(null);
  const { near, visible } = useOnScreen(box);
  const play = visible && !paused;
  const rendered = card.renderStatus === "rendered" && !!card.videoUrl;

  useEffect(() => {
    const media = rendered ? video.current : player.current;
    if (!media) return;
    if (play) Promise.resolve(media.play()).catch(() => undefined);
    else media.pause();
  }, [play, near, rendered]);

  return (
    <div ref={box} className="aspect-[9/16] w-full bg-ink">
      {rendered ? (
        // The final MP4, so what you see here is exactly what gets posted.
        <video ref={video} src={card.videoUrl!} controls loop muted playsInline preload="metadata"
          className="block h-full w-full object-cover" />
      ) : near ? (
        <Player
          ref={player}
          {...playerConfig(card)}
          compositionWidth={WALL_OF_TEXT.width}
          compositionHeight={WALL_OF_TEXT.height}
          fps={WALL_OF_TEXT.fps}
          style={{ width: "100%", height: "100%", display: "block" }}
          controls
          loop
          initiallyMuted
          // Free for individuals and companies of up to 3 people; bigger teams
          // need a company license: https://remotion.dev/license
          acknowledgeRemotionLicense
        />
      ) : stillOf(card) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={stillOf(card)!} alt="" loading="lazy"
          className="h-full w-full object-cover opacity-70" />
      ) : null}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function Status({ card, acting, onApprove, onReject, onEdit }: {
  card: DoneCard;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  if (card.reviewStatus === "pending") {
    return (
      <div className="flex gap-2">
        <Button onClick={onApprove} disabled={acting} className="flex-1 px-3">
          {acting ? "…" : "Approve · 1 credit"}
        </Button>
        <Button onClick={onEdit} disabled={acting} variant="secondary" className="px-3">
          Edit
        </Button>
        <Button onClick={onReject} disabled={acting} variant="secondary" className="px-3">
          Skip
        </Button>
      </div>
    );
  }
  if (card.renderStatus === "rendering") {
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-yolk px-4 py-2.5">
        <span className="size-3 animate-ping rounded-full bg-ink" aria-hidden />
        <p className="text-sm font-semibold">Rendering your video… usually under a minute</p>
      </div>
    );
  }
  if (card.renderStatus === "failed") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-tomato bg-tomato-wash px-4 py-2.5">
        <p className="text-sm font-medium">Render failed. Your credit was refunded.</p>
        <div className="flex shrink-0 gap-2">
          <Button onClick={onEdit} disabled={acting} variant="secondary" className="px-3 py-1.5 text-sm">
            Edit
          </Button>
          <Button onClick={onApprove} disabled={acting} variant="danger" className="px-3 py-1.5 text-sm">
            Retry
          </Button>
        </div>
      </div>
    );
  }
  if (card.renderStatus === "rendered" && card.videoUrl) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-leaf bg-leaf-wash px-4 py-2.5">
        <p className="text-sm font-semibold text-leaf-deep">Rendered and ready to post</p>
        <div className="flex shrink-0 items-center gap-3">
          <ShareButton card={card} />
          <a href={card.videoUrl} download className="text-sm font-semibold underline decoration-2 underline-offset-4">
            Download MP4
          </a>
        </div>
      </div>
    );
  }
  return null;
}

// On phones: hands the MP4 to the share sheet (pick Instagram → Reels), with
// the caption copied so it can be pasted. Add the suggested audio there.
// Hidden where the browser can't share files (most desktops).
export function ShareButton({ card }: { card: DoneCard }) {
  const [state, setState] = useState<"idle" | "busy" | "copied">("idle");
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const probe = new File([""], "post.mp4", { type: "video/mp4" });
    // Checked after mount: navigator doesn't exist during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
  }, []);
  if (!supported || !card.videoUrl) return null;

  const share = async () => {
    setState("busy");
    try {
      await navigator.clipboard.writeText(card.caption).catch(() => undefined);
      const blob = await (await fetch(card.videoUrl!)).blob();
      const file = new File([blob], "post.mp4", { type: "video/mp4" });
      await navigator.share({ files: [file], text: card.caption });
      setState("copied");
    } catch {
      setState("idle");
    }
  };
  return (
    <button type="button" onClick={share} disabled={state === "busy"}
      className="rounded-lg border-2 border-ink bg-card px-2.5 py-1 text-sm font-semibold">
      {state === "busy" ? "Preparing…" : state === "copied" ? "Caption copied ✓" : "Share to Instagram"}
    </button>
  );
}

// A still to show while a card's player isn't mounted.
export function stillOf(card: DoneCard) {
  if (card.format === "slideshow") return card.images[0] ?? null;
  if (card.format === "green_screen") return card.style.backdrop?.url ?? null;
  return card.background?.posterUrl ?? null;
}
