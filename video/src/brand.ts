// The site's own brand, for the edit: graphite + one green, JetBrains Mono, the VT323 mark.
// Values mirror src/styles/tokens.css; the mark is the site's CAT_MARK.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export { CAT_MARK } from "../../src/content/mark";

export const C = {
  bg: "#0a0a0b",
  bgElev: "#111113",
  line: "#232326",
  lineStrong: "#404044",
  fg: "#ededeb",
  muted: "#b3b3af",
  subtle: "#8c8c88",
  green: "#00ff82",
} as const;

export const MONO = '"JetBrains Mono", ui-monospace, monospace';
export const MARK = '"VT323", "JetBrains Mono", monospace';

export const fontsReady = Promise.all([
  loadFont({ family: "JetBrains Mono", url: staticFile("fonts/jetbrains-mono-latin-400-normal.woff2"), weight: "400" }),
  loadFont({ family: "JetBrains Mono", url: staticFile("fonts/jetbrains-mono-latin-700-normal.woff2"), weight: "700" }),
  loadFont({ family: "VT323", url: staticFile("fonts/vt323-mark.woff2"), weight: "400" }),
]);

export type Format = "9x16" | "4x5";
export const SIZE: Record<Format, { width: number; height: number }> = {
  "9x16": { width: 1080, height: 1920 },
  "4x5": { width: 1080, height: 1350 },
};
/** Where captions sit: clear of Instagram's story UI (top ~250 px, bottom ~340 px) and of
 *  the site's own chrome (identity top-left, nav at the bottom). */
export const CAPTION_Y: Record<Format, number> = { "9x16": 1330, "4x5": 1000 };

export const FPS = 30;
