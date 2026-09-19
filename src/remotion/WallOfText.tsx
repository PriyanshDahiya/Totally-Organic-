import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  type CalculateMetadataFunction,
} from "remotion";
import { FRAME, OverlayText } from "./text";
import { wallOfTextBaseSize, type FontId, type Music, type ProductLayer, type TextBox, type TextPosition } from "./style";

export type { FontId, Music, TextBox, TextPosition } from "./style";
export { FONT_FAMILIES } from "./text";

// Wall of Text: overlay text over a vertical background clip. The same
// component runs in the browser preview (@remotion/player), the card editor
// and the server render on approve, so all three always match.

export const WALL_OF_TEXT = FRAME;

export type WallOfTextProps = {
  lines: string[];
  backgroundUrl: string | null;
  // Seconds of usable footage; shorter clips loop.
  backgroundDurationSeconds: number | null;
  textPosition: TextPosition;
  // Dragged position from the editor; overrides textPosition.
  textBox?: TextBox | null;
  music: Music | null;
  font: FontId;
  textScale: number;
  // The brand's product floating over the footage, under the text.
  product?: ProductLayer | null;
};

// Long enough to read the text once at a relaxed pace, since a Reel that
// ends before the viewer finishes reading gets rewatched (good) but one that
// cuts them off mid-sentence feels broken (bad).
export function wallOfTextDurationInFrames(lines: string[]) {
  const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const seconds = Math.min(10, Math.max(5, 1.5 + words / 3.5));
  return Math.round(seconds * FRAME.fps);
}

export const calculateWallOfTextMetadata: CalculateMetadataFunction<WallOfTextProps> = ({ props }) => ({
  durationInFrames: wallOfTextDurationInFrames(props.lines),
});

export function WallOfText({
  lines,
  backgroundUrl,
  backgroundDurationSeconds,
  textPosition,
  textBox,
  music,
  font,
  textScale,
  product,
}: WallOfTextProps) {
  const durationInFrames = wallOfTextDurationInFrames(lines);
  const loopFrames = backgroundDurationSeconds ? Math.max(1, Math.floor(backgroundDurationSeconds * FRAME.fps)) : null;
  const video = backgroundUrl && (
    <OffthreadVideo src={backgroundUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {video && (loopFrames && loopFrames < durationInFrames ? <Loop durationInFrames={loopFrames}>{video}</Loop> : video)}
      {music && <Audio src={music.url} volume={0.55} loop />}
      {product && <ProductOverlay product={product} />}
      <OverlayText
        lines={lines}
        baseSize={wallOfTextBaseSize(lines)}
        textPosition={textPosition}
        textBox={textBox}
        font={font}
        textScale={textScale}
      />
    </AbsoluteFill>
  );
}

// The product cutout: pops in over the first few frames (it's visible on
// frame 0, which is the thumbnail), then floats gently so it feels placed in
// the scene rather than pasted on.
export function ProductOverlay({ product }: { product: ProductLayer }) {
  const frame = useCurrentFrame();
  const width = product.width * FRAME.width;
  const height = width / (product.aspect || 1);
  const scale = interpolate(frame, [0, 8], [0.92, 1], { extrapolateRight: "clamp" });
  const float = Math.sin(frame / 18) * 6;
  return (
    <Img
      src={product.url}
      data-product-layer
      style={{
        position: "absolute",
        left: product.x * FRAME.width - width / 2,
        top: product.y * FRAME.height - height / 2,
        width,
        height,
        objectFit: "contain",
        transform: `translateY(${float}px) scale(${scale}) rotate(-3deg)`,
        filter: "drop-shadow(0 24px 30px rgba(0,0,0,0.45))",
      }}
    />
  );
}
