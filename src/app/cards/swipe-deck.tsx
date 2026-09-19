"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, FinePrint, Stamp, Sticker } from "@/components/ui";
import { approveCard, rejectCard } from "./actions";
import { CardDetails, CardMedia, stillOf, type DoneCard } from "./card-list";
import { CardEditor } from "./card-editor";
import type { PreviewCard } from "./data";

// Tinder-style review: one card at a time, drag right to approve (renders
// the video, 1 credit), left to skip. Every swipe waits a few seconds with
// an Undo before it counts, because approving spends a credit and a stray
// drag shouldn't.

export type DeckItem = { key: string; card: PreviewCard | null };

const SWIPE_THRESHOLD = 110;
const UNDO_MS = 4000;
const FLY_MS = 260;

type Pending = { key: string; card: DoneCard; kind: "approve" | "skip"; timer: ReturnType<typeof setTimeout> };

export function SwipeDeck({
  items,
  onDecided,
  onDismissFailed,
  onRefreshed,
  onEditorChange,
  growing,
  onGrow,
}: {
  // Cards waiting for a decision, newest last; plus slots still generating.
  items: DeckItem[];
  // Approved (with the card now rendering) or skipped (null).
  onDecided: (key: string, card: PreviewCard | null) => void;
  onDismissFailed: (key: string) => void;
  onRefreshed: (key: string) => void;
  onEditorChange: (open: boolean) => void;
  growing: boolean;
  onGrow: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Mirrors `pending` for timers and cleanup, which run outside render.
  const pendingRef = useRef<Pending | null>(null);
  const setPendingBoth = useCallback((p: Pending | null) => {
    pendingRef.current = p;
    setPending(p);
  }, []);

  // The card being decided is hidden from the deck while its Undo runs.
  const visible = items.filter((i) => i.key !== pending?.key);
  const top = visible[0];
  const next = visible[1];

  const execute = useCallback(
    async (p: Pending) => {
      const result = p.kind === "approve" ? await approveCard(p.card.videoAssetId!) : await rejectCard(p.card.videoAssetId!);
      if (!result.ok) {
        // Put the card back so the founder can see what happened.
        setError(result.error);
        return;
      }
      onDecided(p.key, p.kind === "skip" ? null : { ...p.card, reviewStatus: "approved", renderStatus: "rendering" });
    },
    [onDecided],
  );

  // Run whatever is waiting right away (a new swipe, or leaving the page).
  const flush = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    setPendingBoth(null);
    void execute(p);
  }, [execute, setPendingBoth]);

  useEffect(() => () => flush(), [flush]);

  const decide = useCallback(
    (kind: "approve" | "skip") => {
      if (!top?.card || top.card.status !== "done" || !top.card.videoAssetId) return;
      flush();
      setError(null);
      const card = top.card;
      const p: Pending = {
        key: top.key,
        card,
        kind,
        timer: setTimeout(() => {
          setPendingBoth(null);
          void execute(p);
        }, UNDO_MS),
      };
      setPendingBoth(p);
    },
    [top, flush, execute, setPendingBoth],
  );

  const undo = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    setPendingBoth(null);
  };

  const openEditor = useCallback(() => {
    if (top?.card?.status !== "done") return;
    setEditing(true);
    onEditorChange(true);
  }, [top, onEditorChange]);

  // Keyboard: arrows to decide, E to edit (not while typing or editing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (editing || target?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") decide("approve");
      else if (e.key === "ArrowLeft") decide("skip");
      else if (e.key.toLowerCase() === "e") openEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, openEditor, editing]);

  return (
    <section className="flex flex-col items-center gap-5">
      <div className="relative w-full max-w-[340px]">
        {/* The next card peeks out behind: a still, not a second player. */}
        {next && (
          <div className="absolute inset-0 translate-y-3 scale-[0.96] rounded-2xl border-2 border-ink bg-paper-deep" aria-hidden>
            <NextPreview item={next} />
          </div>
        )}
        {top ? (
          top.card?.status === "failed" ? (
            <FailedCard error={top.card.error} onDismiss={() => onDismissFailed(top.key)} />
          ) : top.card?.status === "done" ? (
            <DraggableCard key={top.key} card={top.card} paused={editing} onSwipe={decide} />
          ) : (
            <Growing />
          )
        ) : (
          <EmptyDeck growing={growing} onGrow={onGrow} />
        )}
      </div>

      {top?.card?.status === "done" && (
        <>
          <div className="flex items-center gap-4">
            <RoundButton label="Skip" tone="skip" onClick={() => decide("skip")}>✕</RoundButton>
            <Button variant="secondary" onClick={openEditor} className="rounded-full px-5">
              Edit
            </Button>
            <RoundButton label="Approve, 1 credit" tone="approve" onClick={() => decide("approve")}>✓</RoundButton>
          </div>
          <FinePrint>Drag or use ← → · E to edit · approving renders the video for 1 credit</FinePrint>
          <div className="w-full max-w-[340px] space-y-3">
            <CardDetails card={top.card} />
          </div>
        </>
      )}

      {error && <p className="max-w-[340px] text-center text-sm font-medium text-tomato">{error}</p>}

      {pending && (
        <div role="status"
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full border-2 border-ink bg-ink px-5 py-3 text-paper shadow-[4px_4px_0_var(--color-leaf)]">
          <span className="text-sm font-semibold">
            {pending.kind === "approve" ? "Approving: rendering starts in a moment" : "Skipped"}
          </span>
          <button onClick={undo} className="text-sm font-bold text-yolk underline underline-offset-4">
            Undo
          </button>
        </div>
      )}

      {editing && top?.card?.status === "done" &&
        createPortal(
          <CardEditor
            card={top.card}
            onClose={() => {
              setEditing(false);
              onEditorChange(false);
            }}
            onSaved={() => {
              setEditing(false);
              onEditorChange(false);
              onRefreshed(top.key);
            }}
          />,
          document.body,
        )}
    </section>
  );
}

// The top card: follows the pointer, tilts, shows APPROVE / SKIP stamps as
// you drag, and flies off past the threshold.
function DraggableCard({ card, paused, onSwipe }: {
  card: DoneCard;
  paused: boolean;
  onSwipe: (kind: "approve" | "skip") => void;
}) {
  const [dx, setDx] = useState(0);
  const [flying, setFlying] = useState<"approve" | "skip" | null>(null);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; id: number } | null>(null);

  const release = () => {
    start.current = null;
    setDragging(false);
    if (Math.abs(dx) < SWIPE_THRESHOLD) return setDx(0);
    const kind = dx > 0 ? "approve" : "skip";
    setFlying(kind);
    setTimeout(() => onSwipe(kind), FLY_MS);
  };

  const x = flying ? (flying === "approve" ? 1 : -1) * 700 : dx;
  const strength = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD);

  return (
    <div
      onPointerDown={(e) => {
        // Let the player's own controls (play, scrub) work normally.
        if ((e.target as HTMLElement).closest("button, [role=slider], input")) return;
        start.current = { x: e.clientX - dx, id: e.pointerId };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => start.current && setDx(e.clientX - start.current.x)}
      onPointerUp={release}
      onPointerCancel={release}
      style={{
        transform: `translateX(${x}px) rotate(${x / 18}deg)`,
        transition: dragging ? "none" : `transform ${FLY_MS}ms ease-out`,
        touchAction: "pan-y",
      }}
      className="relative cursor-grab select-none active:cursor-grabbing"
    >
      <Sticker tone="card" rotate={-4} className="absolute -left-3 -top-3 z-20">
        {card.format === "slideshow" ? "Slideshow" : card.format === "green_screen" ? "Meme" : "Reel"}
      </Sticker>
      <div className="overflow-hidden rounded-2xl border-2 border-ink bg-ink shadow-[6px_6px_0_var(--color-ink)]">
        <CardMedia card={card} paused={paused} />
      </div>
      {dx > 0 && (
        <Stamp top="SHIP" center="YES" bottom="1 CREDIT" tone="leaf" size={120} rotate={-16}
          className="pointer-events-none absolute left-4 top-8 z-10" style={{ opacity: strength }} />
      )}
      {dx < 0 && (
        <Stamp top="SKIP" center="NOPE" bottom="IT'S FREE" tone="tomato" size={120} rotate={16}
          className="pointer-events-none absolute right-4 top-8 z-10" style={{ opacity: strength }} />
      )}
    </div>
  );
}

function NextPreview({ item }: { item: DeckItem }) {
  const card = item.card;
  const still = card?.status === "done" ? stillOf(card) : null;
  return still ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={still} alt="" className="h-full w-full rounded-2xl object-cover opacity-50" />
  ) : null;
}

function RoundButton({ label, tone, onClick, children }: {
  label: string;
  tone: "skip" | "approve";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`grid size-16 place-items-center rounded-full border-2 border-ink text-2xl font-bold shadow-[3px_3px_0_var(--color-ink)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-ink)] ${
        tone === "approve" ? "bg-leaf text-card hover:bg-leaf-deep" : "bg-card text-tomato hover:bg-tomato-wash"
      }`}>
      {children}
    </button>
  );
}

function Growing() {
  return (
    <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-ink/40 bg-paper-deep/60">
      <span className="animate-bounce text-4xl" aria-hidden>
        🌱
      </span>
      <FinePrint>Growing your next post…</FinePrint>
    </div>
  );
}

function FailedCard({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-tomato bg-tomato-wash p-6 text-center">
      <Stamp top="THIS POST" center="FAILED" bottom="TRY AGAIN" tone="tomato" size={96} />
      <p className="line-clamp-4 break-words text-sm">{error}</p>
      <Button variant="secondary" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

function EmptyDeck({ growing, onGrow }: { growing: boolean; onGrow: () => void }) {
  return (
    <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-ink/40 px-6 text-center">
      <Stamp top="ALL" center="DONE" bottom="FOR NOW" tone="ink" size={100} />
      <p className="text-ink-soft">You&apos;ve been through everything. Grow a fresh batch?</p>
      <Button onClick={onGrow} disabled={growing}>
        {growing ? "Growing…" : "Grow more posts"}
      </Button>
    </div>
  );
}
