import "server-only";
import path from "node:path";
import { createRequire } from "node:module";
import jpeg from "jpeg-js";
import { TEXT_BOX_BOUNDS, type TextBox } from "@/remotion/style";

// Smart positioning: find faces in a background clip and put the text where
// it doesn't cover them. Runs on the server with a small face detector
// (TinyFaceDetector, ~200 KB, shipped inside the npm package) on
// TensorFlow.js's WebAssembly backend, so nothing is downloaded at runtime
// and no native build is needed.

const require = createRequire(import.meta.url);

type FaceApi = typeof import("@vladmandic/face-api");
let ready: Promise<FaceApi> | null = null;

function loadDetector(): Promise<FaceApi> {
  ready ??= (async () => {
    const tf = require("@tensorflow/tfjs");
    const wasm = require("@tensorflow/tfjs-backend-wasm");
    const faceapi: FaceApi = require("@vladmandic/face-api/dist/face-api.node-wasm.js");
    wasm.setWasmPaths(path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm")) + path.sep);
    await tf.setBackend("wasm");
    await tf.ready();
    await faceapi.nets.tinyFaceDetector.loadFromDisk(
      path.join(path.dirname(require.resolve("@vladmandic/face-api/package.json")), "model"),
    );
    return faceapi;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

// A face's vertical band on the frame, as fractions of the height.
export type FaceBand = { top: number; bottom: number };

async function facesInImage(url: string): Promise<FaceBand[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const img = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 256 });
  const faceapi = await loadDetector();
  const input = faceapi.tf.tensor3d(img.data, [img.height, img.width, 3]);
  try {
    const found = await faceapi.detectAllFaces(
      input as unknown as Parameters<FaceApi["detectAllFaces"]>[0],
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 }),
    );
    // The frame is shown 9:16 "cover"; Pexels stills are already portrait,
    // so vertical fractions map straight across.
    return found.map((d) => ({ top: d.box.y / img.height, bottom: (d.box.y + d.box.height) / img.height }));
  } finally {
    input.dispose();
  }
}

// Faces across a few frames of the clip (people move), merged.
export async function findFaces(frameUrls: string[]): Promise<FaceBand[]> {
  const all = await Promise.all(frameUrls.slice(0, 3).map((u) => facesInImage(u).catch(() => [])));
  return all.flat();
}

// Rough height of the text block as a fraction of the frame, from the
// Wall of Text sizing rules (700px column, ~0.52em per character).
function estimateTextHeight(lines: string[], fontSize: number) {
  const perLine = Math.max(8, Math.floor(700 / (fontSize * 0.52)));
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return (rows * fontSize * 1.3 + (lines.length - 1) * fontSize * 0.15) / 1920;
}

// Where the text's centre usually sits (the "upper middle" preset).
const PREFERRED_Y = 0.38;
// Keep a little air between the text and a face.
const MARGIN = 0.03;

// The text position closest to the usual spot that stays clear of every
// face; if nothing is fully clear, the one that covers the least face.
// Returns null when there are no faces, so the card keeps its preset.
export function placeAroundFaces(faces: FaceBand[], lines: string[], fontSize: number): TextBox | null {
  if (faces.length === 0) return null;
  const h = estimateTextHeight(lines, fontSize);
  const [lo, hi] = TEXT_BOX_BOUNDS.y;
  const candidates: number[] = [];
  for (let y = lo + h / 2; y <= hi - h / 2 + 1e-9; y += 0.01) candidates.push(y);
  if (candidates.length === 0) return null; // text taller than the safe area

  const overlap = (y: number) =>
    faces.reduce((sum, f) => {
      const top = Math.max(y - h / 2, f.top - MARGIN);
      const bottom = Math.min(y + h / 2, f.bottom + MARGIN);
      return sum + Math.max(0, bottom - top);
    }, 0);

  const best = candidates
    .map((y) => ({ y, overlap: overlap(y), distance: Math.abs(y - PREFERRED_Y) }))
    .sort((a, b) => a.overlap - b.overlap || a.distance - b.distance)[0];
  return { x: 0.5, y: Math.round(best.y * 1000) / 1000 };
}
