import type { ComponentType } from "react";
import { WallOfText, wallOfTextDurationInFrames } from "@/remotion/WallOfText";
import { Slideshow, slideshowDurationInFrames } from "@/remotion/Slideshow";
import { Meme, memeDurationInFrames } from "@/remotion/Meme";
import { slideImagesFor, type CardStyle } from "@/remotion/style";
import type { StockClip } from "@/lib/stock";
import type { PreviewCard } from "./data";

type DoneCard = Extract<PreviewCard, { status: "done" }>;

// What the browser player needs to show a card, in either format. The feed
// passes the saved card; the editor passes its unsaved edits on top.
export function playerConfig(
  card: DoneCard,
  edits: { lines?: string[]; style?: CardStyle; background?: StockClip | null } = {},
) {
  const lines = edits.lines ?? card.lines;
  const { music, slideImages, ...style } = edits.style ?? card.style;
  const background = edits.background === undefined ? card.background : edits.background;

  if (card.format === "green_screen") {
    return {
      component: Meme as ComponentType<Record<string, unknown>>,
      inputProps: { lines, music, ...style, backdrop: style.backdrop ?? null, meme: style.meme ?? null },
      durationInFrames: memeDurationInFrames(lines, style.meme ?? null),
    };
  }
  if (card.format === "slideshow") {
    return {
      component: Slideshow as ComponentType<Record<string, unknown>>,
      inputProps: { slides: lines, images: slideImagesFor({ slideImages }, card.images), music, ...style },
      durationInFrames: slideshowDurationInFrames(lines),
    };
  }
  return {
    component: WallOfText as ComponentType<Record<string, unknown>>,
    inputProps: {
      lines,
      backgroundUrl: background?.videoUrl ?? null,
      backgroundDurationSeconds: background?.durationSeconds ?? null,
      music,
      ...style,
    },
    durationInFrames: wallOfTextDurationInFrames(lines),
  };
}
