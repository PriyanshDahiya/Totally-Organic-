import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  type CalculateMetadataFunction,
} from "remotion";
import { FRAME, OverlayText } from "./text";
import type { FontId, Music, TextBox, TextPosition } from "./style";

// Slideshow: the brand's product photos, one line of text per slide, like
// TikTok's photo mode. Rendered as a video so it posts as a Reel.

export type SlideshowProps = {
  // One entry per slide; the first is the hook.
  slides: string[];
  images: string[];
  textPosition: TextPosition;
  textBox?: TextBox | null;
  music: Music | null;
  font: FontId;
  textScale: number;
};

const FADE_FRAMES = 6;

// The photo sits in a band below the text rather than behind it, so the
// text stays readable and the product stays visible. The band ends above
// Instagram's caption area.
const PHOTO_BAND = { top: 660, height: 860 };

// Each slide stays up long enough to read its line, then moves on quickly:
// slideshows that drag get swiped away.
function slideFrames(line: string) {
  const words = line.split(/\s+/).filter(Boolean).length;
  const seconds = Math.min(4.5, Math.max(2.2, 1.2 + words / 3.5));
  return Math.round(seconds * FRAME.fps);
}

export function slideshowDurationInFrames(slides: string[]) {
  return Math.max(1, slides.reduce((n, s) => n + slideFrames(s), 0));
}

export const calculateSlideshowMetadata: CalculateMetadataFunction<SlideshowProps> = ({ props }) => ({
  durationInFrames: slideshowDurationInFrames(props.slides),
});

function Slide({ image, line, duration, first, style }: {
  image: string | undefined;
  line: string;
  duration: number;
  first: boolean;
  style: Pick<SlideshowProps, "textPosition" | "textBox" | "font" | "textScale">;
}) {
  const frame = useCurrentFrame();
  // Slow push-in keeps a still photo from feeling dead.
  const zoom = interpolate(frame, [0, duration], [1, 1.07], { extrapolateRight: "clamp" });
  // The hook slide is visible from frame 0 (it's the thumbnail); later
  // slides fade in over the previous one.
  const opacity = first ? 1 : interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "#111" }}>
      {image && (
        <>
          {/* Blurred fill so square product shots still cover a 9:16 frame. */}
          <Img src={image} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(40px) brightness(0.6)", transform: "scale(1.25)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: PHOTO_BAND.top, height: PHOTO_BAND.height, transform: `scale(${zoom})` }}>
            <Img src={image} style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 18px 40px rgba(0,0,0,0.35))" }} />
          </div>
        </>
      )}
      <OverlayText
        lines={[line]}
        baseSize={line.length > 60 ? 54 : 60}
        {...style}
        // Presets always sit above the photo band; only a dragged position
        // (the founder's explicit choice) can overlap the product.
        textPosition={style.textBox ? style.textPosition : "top"}
      />
    </AbsoluteFill>
  );
}

export function Slideshow({ slides, images, music, ...style }: SlideshowProps) {
  const durations = slides.map(slideFrames);
  const starts = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {slides.map((line, i) => {
        const duration = durations[i];
        const start = starts[i];
        return (
          // Each slide starts a few frames early (except the first) so it can
          // fade in over the one before it.
          <Sequence key={i} from={Math.max(0, start - (i ? FADE_FRAMES : 0))} durationInFrames={duration + (i ? FADE_FRAMES : 0)}>
            <Slide image={images.length ? images[i % images.length] : undefined} line={line} duration={duration} first={i === 0} style={style} />
          </Sequence>
        );
      })}
      {music && <Audio src={music.url} volume={0.55} loop />}
    </AbsoluteFill>
  );
}
