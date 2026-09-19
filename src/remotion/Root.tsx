import { Composition } from "remotion";
import {
  WallOfText,
  WALL_OF_TEXT,
  calculateWallOfTextMetadata,
  wallOfTextDurationInFrames,
  type WallOfTextProps,
} from "./WallOfText";
import { Slideshow, calculateSlideshowMetadata, slideshowDurationInFrames, type SlideshowProps } from "./Slideshow";

const style = { textPosition: "upper", textBox: null, music: null, font: "classic", textScale: 1 } as const;

const wallOfTextDefaults: WallOfTextProps = {
  lines: ["me at 10pm: tomorrow I change my life", "me at 6am:"],
  backgroundUrl: null,
  backgroundDurationSeconds: null,
  ...style,
};

const slideshowDefaults: SlideshowProps = {
  slides: ["things that just make sense", "a razor that doesn't fight you", "done in two minutes"],
  images: [],
  ...style,
};

export function Root() {
  return (
    <>
      <Composition
        id="WallOfText"
        component={WallOfText}
        width={WALL_OF_TEXT.width}
        height={WALL_OF_TEXT.height}
        fps={WALL_OF_TEXT.fps}
        // Overridden per card by calculateMetadata (duration follows the text).
        durationInFrames={wallOfTextDurationInFrames(wallOfTextDefaults.lines)}
        calculateMetadata={calculateWallOfTextMetadata}
        defaultProps={wallOfTextDefaults}
      />
      <Composition
        id="Slideshow"
        component={Slideshow}
        width={WALL_OF_TEXT.width}
        height={WALL_OF_TEXT.height}
        fps={WALL_OF_TEXT.fps}
        durationInFrames={slideshowDurationInFrames(slideshowDefaults.slides)}
        calculateMetadata={calculateSlideshowMetadata}
        defaultProps={slideshowDefaults}
      />
    </>
  );
}
