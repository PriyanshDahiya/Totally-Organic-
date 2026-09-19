import {
  AbsoluteFill,
  Audio,
  Html5Video,
  Img,
  Loop,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  type CalculateMetadataFunction,
} from "remotion";
import { FRAME, OverlayText } from "./text";
import { ProductOverlay } from "./WallOfText";
import { type Backdrop, type FontId, type MemeLayer, type Music, type ProductLayer, type TextBox, type TextPosition } from "./style";

// Meme (green screen): a still photo for the vibe, the setup line at the
// top, and a keyed reaction meme at the bottom delivering the punchline
// with its own sound. The same component runs in the preview, the editor
// and the render on approve.

export type MemeProps = {
  lines: string[];
  backdrop: Backdrop | null;
  meme: MemeLayer | null;
  textPosition: TextPosition;
  textBox?: TextBox | null;
  music: Music | null;
  font: FontId;
  textScale: number;
  // The brand's product beside the meme.
  product?: ProductLayer | null;
};

// The meme cut-out's box: the text owns the top (textPosition "top"), the
// meme the band below it, above Instagram's caption area.
const MEME_BOX = { maxWidth: FRAME.width * 0.92, maxHeight: FRAME.height * 0.42, bottom: FRAME.height * 0.17 };

// Long enough to read the setup and see the meme land at least once; the
// meme loops if the text takes longer to read.
export function memeDurationInFrames(lines: string[], meme: Pick<MemeLayer, "durationSeconds"> | null) {
  const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const reading = 2 + words / 3.5;
  const seconds = Math.min(10, Math.max(4, reading, (meme?.durationSeconds ?? 0) + 0.6));
  return Math.round(seconds * FRAME.fps);
}

export const calculateMemeMetadata: CalculateMetadataFunction<MemeProps> = ({ props }) => ({
  durationInFrames: memeDurationInFrames(props.lines, props.meme),
});

// Big bold text reads best over a busy photo.
function memeBaseSize(lines: string[]) {
  const chars = lines.reduce((n, l) => n + l.length, 0);
  return chars > 120 ? 54 : chars > 70 ? 60 : 68;
}

export function Meme({ lines, backdrop, meme, textPosition, textBox, music, font, textScale, product }: MemeProps) {
  const frame = useCurrentFrame();
  const durationInFrames = memeDurationInFrames(lines, meme);
  // Slow push-in so the still doesn't feel frozen.
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.08]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#1d1b17" }}>
      {backdrop && (
        <Img
          src={backdrop.url}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
        />
      )}
      {/* A soft shade at the top keeps white text readable on bright photos. */}
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0) 45%)" }} />
      {meme && <MemeClip meme={meme} durationInFrames={durationInFrames} beside={!!product} />}
      {product && <ProductOverlay product={product} />}
      {music && <Audio src={music.url} volume={0.35} loop />}
      <OverlayText
        lines={lines}
        baseSize={memeBaseSize(lines)}
        textPosition={textPosition}
        textBox={textBox}
        font={font}
        textScale={textScale}
      />
    </AbsoluteFill>
  );
}

function MemeClip({ meme, durationInFrames, beside }: { meme: MemeLayer; durationInFrames: number; beside: boolean }) {
  const frame = useCurrentFrame();
  // With a product next to it, the meme takes the left ~60% of the frame.
  const maxWidth = beside ? FRAME.width * 0.6 : MEME_BOX.maxWidth;
  const scale = Math.min(maxWidth / meme.width, MEME_BOX.maxHeight / meme.height);
  const width = meme.width * scale;
  const height = meme.height * scale;
  // Pops up from below on the first frames.
  const rise = interpolate(frame, [0, 7], [60, 0], { extrapolateRight: "clamp" });
  const loopFrames = Math.max(1, Math.round(meme.durationSeconds * FRAME.fps));

  // Transparent memes play in Chrome's own <video>, which decodes VP9 alpha;
  // OffthreadVideo's decoder drops the alpha channel.
  const style = { width: "100%", height: "100%", objectFit: "contain" } as const;
  const clip = meme.transparent ? <Html5Video src={meme.url} style={style} /> : <OffthreadVideo src={meme.url} style={style} />;
  return (
    <div
      data-meme-layer
      style={{
        position: "absolute",
        left: beside ? Math.max(24, FRAME.width * 0.33 - width / 2) : (FRAME.width - width) / 2,
        top: FRAME.height - MEME_BOX.bottom - height,
        width,
        height,
        transform: `translateY(${rise}px)`,
        // Framed clips (not green screen) get a card look; cut-outs a shadow.
        ...(meme.transparent
          ? { filter: "drop-shadow(0 18px 24px rgba(0,0,0,0.45))" }
          : { borderRadius: 28, overflow: "hidden", border: "6px solid white", boxShadow: "0 18px 40px rgba(0,0,0,0.45)" }),
      }}
    >
      {loopFrames < durationInFrames ? <Loop durationInFrames={loopFrames}>{clip}</Loop> : clip}
    </div>
  );
}
