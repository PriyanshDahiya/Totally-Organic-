// Entry point for server-side rendering (lib/render.ts bundles this).
// The browser preview imports the compositions directly instead.
import { registerRoot } from "remotion";
import { Root } from "./Root";

registerRoot(Root);
