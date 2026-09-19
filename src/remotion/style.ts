// Per-card presentation, shared by the composition, the editor and the
// server. Lives next to the compositions (relative imports only) because the
// Remotion bundler doesn't know the app's "@/" alias.

export type TextPosition = "top" | "upper" | "center";

export type FontId = "classic" | "impact" | "serif" | "typewriter" | "marker";

export type Music = { url: string; title: string; credit: string | null };

// Where the founder dragged the text in the editor: the text block's centre,
// as fractions of the frame (0-1). Overrides textPosition when set.
export type TextBox = { x: number; y: number };

// The brand's product floating over the video: a cutout (transparent PNG)
// placed by its centre, as fractions of the frame, sized by width.
export type ProductLayer = {
  url: string;
  // Cutout width / height, so the layer keeps its shape at any size.
  aspect: number;
  x: number;
  y: number;
  width: number;
};

export type CardStyle = {
  textPosition: TextPosition;
  textBox: TextBox | null;
  music: Music | null;
  font: FontId;
  // Multiplier on the automatic text size.
  textScale: number;
  // Slideshow only: the product photos to use, in order. Null means the
  // first few of the product's gallery.
  slideImages?: string[] | null;
  // Wall of Text only: the product on top of the footage.
  product?: ProductLayer | null;
};

// Keeps the product inside the frame and clear of Instagram's header and
// caption areas, at a size between a small badge and most of the width.
export const PRODUCT_BOUNDS = { x: [0.12, 0.88], y: [0.18, 0.8], width: [0.15, 0.8] } as const;

export function clampProduct(p: ProductLayer): ProductLayer {
  const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    ...p,
    x: r(clamp(p.x, PRODUCT_BOUNDS.x)),
    y: r(clamp(p.y, PRODUCT_BOUNDS.y)),
    width: r(clamp(p.width, PRODUCT_BOUNDS.width)),
  };
}

// Galleries usually open with clean product shots and end with ad graphics
// that have their own text, which clashes with the overlay.
export const DEFAULT_SLIDE_IMAGES = 3;

export function slideImagesFor(style: Pick<CardStyle, "slideImages">, gallery: string[]) {
  const chosen = (style.slideImages ?? []).filter((u) => gallery.includes(u));
  return chosen.length ? chosen : gallery.slice(0, DEFAULT_SLIDE_IMAGES);
}

export const DEFAULT_STYLE: CardStyle = {
  textPosition: "upper",
  textBox: null,
  music: null,
  font: "classic",
  textScale: 1,
  product: null,
};

// How far a dragged text block's centre may go. The column is ~65% of the
// frame wide, so it can't drift sideways far; vertically it stays out of
// Instagram's header (top ~12%) and caption area (bottom ~22%).
export const TEXT_BOX_BOUNDS = { x: [0.3, 0.7], y: [0.14, 0.76] } as const;

export function clampTextBox({ x, y }: TextBox): TextBox {
  const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
  return { x: clamp(x, TEXT_BOX_BOUNDS.x), y: clamp(y, TEXT_BOX_BOUNDS.y) };
}

// Cards saved before a field existed get its default.
export function withStyleDefaults(style: Partial<CardStyle> | null | undefined): CardStyle {
  return { ...DEFAULT_STYLE, ...(style ?? {}) };
}

export const TEXT_SCALE = { min: 0.7, max: 1.5 } as const;

// Each font is sized so the same copy fills roughly the same area.
export const FONT_SIZE_FACTOR: Record<FontId, number> = {
  classic: 1,
  impact: 1.12,
  serif: 1.3,
  typewriter: 0.95,
  marker: 1.02,
};

// TikTok's text size is fixed per post, not fitted to the copy; shrink only
// for paragraph-length text so it still fits the column.
export function wallOfTextBaseSize(lines: string[]) {
  const chars = lines.reduce((n, l) => n + l.length, 0);
  return chars > 200 ? 46 : chars > 110 ? 50 : 56;
}

export function wallOfTextFontSize(lines: string[], style: Pick<CardStyle, "font" | "textScale">) {
  return Math.round(wallOfTextBaseSize(lines) * (FONT_SIZE_FACTOR[style.font] ?? 1) * (style.textScale || 1));
}

export const FONT_OPTIONS: { id: FontId; label: string; hint: string }[] = [
  { id: "classic", label: "Classic", hint: "TikTok's own text" },
  { id: "impact", label: "Meme", hint: "Tall, loud, all caps" },
  { id: "serif", label: "Editorial", hint: "Soft serif, calm" },
  { id: "typewriter", label: "Typewriter", hint: "Diary, confessional" },
  { id: "marker", label: "Marker", hint: "Handwritten note" },
];

export const POSITION_OPTIONS: { id: TextPosition; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "upper", label: "Upper middle" },
  { id: "center", label: "Center" },
];
