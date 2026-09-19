import "server-only";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import net from "node:net";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { WallOfTextProps } from "@/remotion/WallOfText";
import type { SlideshowProps } from "@/remotion/Slideshow";

// One entry per composition registered in src/remotion/Root.tsx.
export type RenderJob =
  | { composition: "WallOfText"; props: WallOfTextProps }
  | { composition: "Slideshow"; props: SlideshowProps };

// Renders the same composition the browser preview plays, so the final video
// matches what the founder approved. Runs locally for now; Remotion Lambda is
// the option if renders need to scale or leave the web server.

// Bundling the compositions with webpack takes ~10-30s, so reuse the bundle
// until a file in src/remotion changes (otherwise edits to a template would
// silently keep rendering the old version).
const REMOTION_DIR = path.join(process.cwd(), "src/remotion");
let bundled: { version: number; url: Promise<string> } | null = null;

async function templatesVersion() {
  const files = await readdir(REMOTION_DIR);
  const times = await Promise.all(files.map(async (f) => (await stat(path.join(REMOTION_DIR, f))).mtimeMs));
  return Math.max(...times);
}

async function getServeUrl() {
  const version = await templatesVersion();
  if (bundled?.version !== version) {
    const url = bundle({ entryPoint: path.join(REMOTION_DIR, "index.ts") });
    bundled = { version, url };
    url.catch(() => {
      if (bundled?.url === url) bundled = null;
    });
  }
  return bundled.url;
}

// Remotion serves the bundle on a local port and checks it's free on IPv4
// only, so next to `next dev` (which listens on :3000 over IPv6) it can pick
// 3000 and Chrome ends up loading the Next app. Hand it a port the OS gave us.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export type RenderResult = {
  video: Buffer;
  thumbnail: Buffer;
  renderMs: number;
};

// Each render uses every CPU core, so run them one at a time; parallel
// renders would only slow each other down (and could exhaust memory).
let queue: Promise<unknown> = Promise.resolve();

export function renderVideo(input: RenderJob): Promise<RenderResult> {
  const job = queue.then(() => render(input));
  queue = job.catch(() => undefined);
  return job;
}

async function render({ composition: id, props }: RenderJob): Promise<RenderResult> {
  const started = Date.now();
  const serveUrl = await getServeUrl();
  const inputProps = props as unknown as Record<string, unknown>;
  const port = await freePort();
  const composition = await selectComposition({ serveUrl, id, inputProps, port });

  const dir = await mkdtemp(path.join(os.tmpdir(), "render-"));
  try {
    const videoPath = path.join(dir, "out.mp4");
    const thumbPath = path.join(dir, "thumb.jpg");

    // Instagram Reels spec: 9:16, H.264 video, AAC audio, faststart (Remotion
    // moves the moov atom to the front itself). Reels without an audio track
    // are rejected by some clients, so add a silent one.
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      audioCodec: "aac",
      enforceAudioTrack: true,
      pixelFormat: "yuv420p",
      // Tags the stream as standard-range BT.709 (yuv420p, not the full-range
      // yuvj420p that JPEG frames produce), which is what Instagram expects.
      colorSpace: "bt709",
      crf: 20,
      outputLocation: videoPath,
      port,
    });
    // Frame 0 is what shows before the video plays; it's also the thumbnail.
    await renderStill({ serveUrl, composition, inputProps, frame: 0, imageFormat: "jpeg", output: thumbPath, port });

    return { video: await readFile(videoPath), thumbnail: await readFile(thumbPath), renderMs: Date.now() - started };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
