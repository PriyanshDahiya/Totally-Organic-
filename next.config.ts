import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be opened as 127.0.0.1 as well as localhost; the two
  // hosts keep separate cookies, so each can be switched to a different test
  // brand via /dev/switch.
  allowedDevOrigins: ["127.0.0.1"],
  // The Remotion renderer spawns Chrome and ffmpeg and the bundler runs
  // webpack; they have to run from node_modules, not be bundled by Next.
  // Face detection loads WebAssembly and model files from node_modules at
  // runtime, so it can't be bundled either.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@vladmandic/face-api",
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-backend-wasm",
  ],
};

export default nextConfig;
