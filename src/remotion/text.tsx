import type { CSSProperties } from "react";
import { AbsoluteFill } from "remotion";
import { loadFont as loadTikTokSans } from "@remotion/google-fonts/TikTokSans";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadInstrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadCourierPrime } from "@remotion/google-fonts/CourierPrime";
import { loadFont as loadPermanentMarker } from "@remotion/google-fonts/PermanentMarker";
import { FONT_SIZE_FACTOR, type FontId, type TextBox, type TextPosition } from "./style";

// The overlay text shared by every format, so a post's text looks the same
// whether it's a Wall of Text or a Slideshow. The default look copies
// TikTok's own in-app "Classic" text: medium weight, sentence case, a narrow
// column, a thin outline and no darkening of the footage.

export const FRAME = { width: 1080, height: 1920, fps: 30 } as const;

const latin = { subsets: ["latin"] as ["latin"] };

const FONTS: Record<FontId, { style: CSSProperties }> = {
  classic: {
    style: {
      fontFamily: loadTikTokSans("normal", { weights: ["600"], subsets: ["latin", "latin-ext"] }).fontFamily,
      fontWeight: 600,
    },
  },
  impact: {
    style: {
      fontFamily: loadAnton("normal", { weights: ["400"], ...latin }).fontFamily,
      textTransform: "uppercase",
      letterSpacing: "0.01em",
    },
  },
  serif: {
    style: { fontFamily: loadInstrumentSerif("normal", { weights: ["400"], ...latin }).fontFamily },
  },
  typewriter: {
    style: { fontFamily: loadCourierPrime("normal", { weights: ["700"], ...latin }).fontFamily, fontWeight: 700 },
  },
  marker: {
    style: { fontFamily: loadPermanentMarker("normal", { weights: ["400"], ...latin }).fontFamily },
  },
};

// For showing each font's name in its own face in the editor.
export const FONT_FAMILIES = Object.fromEntries(
  Object.entries(FONTS).map(([id, f]) => [id, f.style.fontFamily as string]),
) as Record<FontId, string>;

// Where the text block's top edge sits for the presets. Instagram's header
// covers ~220px at the top and the caption/audio row ~420px at the bottom.
const TOP: Record<Exclude<TextPosition, "center">, number> = { top: 330, upper: 640 };

export type OverlayTextProps = {
  lines: string[];
  // Size before the font's factor and the user's scale.
  baseSize: number;
  textPosition: TextPosition;
  // Dragged position from the editor; overrides textPosition.
  textBox?: TextBox | null;
  font: FontId;
  textScale: number;
};

export function OverlayText({ lines, baseSize, textPosition, textBox, font, textScale }: OverlayTextProps) {
  const face = FONTS[font] ?? FONTS.classic;
  const fontSize = Math.round(baseSize * (FONT_SIZE_FACTOR[font] ?? 1) * (textScale || 1));

  return (
    <AbsoluteFill
      style={
        textBox
          ? undefined
          : {
              alignItems: "center",
              justifyContent: textPosition === "center" ? "center" : "flex-start",
              paddingTop: textPosition === "center" ? 0 : TOP[textPosition],
            }
      }
    >
      <div
        // The editor finds the text block by this to draw its drag handle.
        data-text-block
        style={{
          ...(textBox && {
            position: "absolute",
            left: textBox.x * FRAME.width,
            top: textBox.y * FRAME.height,
            transform: "translate(-50%, -50%)",
          }),
          width: 700,
          ...face.style,
          fontSize,
          lineHeight: 1.3,
          color: "#fff",
          textAlign: "center",
          // Thin dark edge drawn behind the fill, plus a soft shadow: the
          // TikTok "Classic" treatment that stays legible on bright footage.
          WebkitTextStroke: `${Math.round(fontSize * 0.1)}px rgba(0,0,0,0.85)`,
          paintOrder: "stroke fill",
          textShadow: "0 2px 8px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          // TikTok puts line breaks straight under each other; a hair of space
          // keeps setup and punchline lines ("me at 10pm / me at 6am") readable.
          gap: fontSize * 0.15,
          overflowWrap: "break-word",
        }}
      >
        {lines.map((line, i) => (
          <p key={i} style={{ margin: 0 }}>
            {line}
          </p>
        ))}
      </div>
    </AbsoluteFill>
  );
}
