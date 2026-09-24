// The capture logs (bun run capture writes them next to the footage).
import d916 from "../public/footage/9x16/desk.json";
import l916 from "../public/footage/9x16/laptop.json";
import m916 from "../public/footage/9x16/monitor.json";
import n916 from "../public/footage/9x16/daynight.json";
import c916 from "../public/footage/9x16/cat.json";
import d45 from "../public/footage/4x5/desk.json";
import l45 from "../public/footage/4x5/laptop.json";
import m45 from "../public/footage/4x5/monitor.json";
import n45 from "../public/footage/4x5/daynight.json";
import c45 from "../public/footage/4x5/cat.json";
import type { Format } from "./brand";

export type Log = { fps: number; frames: number; marks: Record<string, number> } & import("./parts/Touches").TouchLog;

export const LOGS: Record<Format, Record<string, Log>> = {
  "9x16": { desk: d916, laptop: l916, monitor: m916, daynight: n916, cat: c916 } as unknown as Record<string, Log>,
  "4x5": { desk: d45, laptop: l45, monitor: m45, daynight: n45, cat: c45 } as unknown as Record<string, Log>,
};
