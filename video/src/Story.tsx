// The story: a Blender hook, five live-site scenes, an end card. Each scene is its own
// capture (public/footage/<format>/<scene>.mp4 + .json); captions are timed from the
// capture's marks, so a re-captured scene stays in sync.
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, interpolate, useCurrentFrame } from "remotion";
import { CAPTION_Y, type Format } from "./brand";
import { Caption } from "./parts/Caption";
import { Touches, type TouchLog } from "./parts/Touches";
import { Outro } from "./parts/Outro";
import { LOGS } from "./logs";

type Cap = { at: string | number; lines: string[]; for: number };
/** from: first frame used; to: last frame, negative = counted back from the capture's end. */
type Scene = { name: string; from: number; to: number; caps: Cap[] };

/** The plot: what is this → it's a website → you can touch it → it does *that* → where. */
export const SCENES: Scene[] = [
  { name: "desk", from: 6, to: -18, caps: [{ at: "drag1", lines: ["and you can walk", "around it."], for: 96 }] },
  { name: "laptop", from: 6, to: -24, caps: [{ at: "tap", lines: ["tap the laptop."], for: 40 }, { at: "type", lines: ["it's a real", "terminal."], for: 60 }] },
  { name: "monitor", from: 6, to: -14, caps: [{ at: "tap", lines: ["tap a screen", "to get closer."], for: 66 }] },
  { name: "daynight", from: 6, to: -22, caps: [{ at: "theme", lines: ["day or night."], for: 50 }, { at: "desk", lines: ["the desk moves", "too."], for: 48 }] },
  { name: "cat", from: 4, to: -18, caps: [{ at: "type", lines: ["type meow."], for: 60 }, { at: "pinch", lines: ["the cat", "answers."], for: 78 }] },
];

export const HOOK_FRAMES = 105;
export const OUTRO_FRAMES = 84;
export const XFADE = 7;

const frames = (format: Format, s: Scene) => (s.to < 0 ? LOGS[format][s.name].frames + s.to : s.to) - s.from;

export const storyDuration = (format: Format) =>
  HOOK_FRAMES + SCENES.reduce((n, s) => n + frames(format, s), 0) + OUTRO_FRAMES - XFADE * (SCENES.length + 1);

const Clip: React.FC<{ format: Format; s: Scene }> = ({ format, s }) => {
  const log = LOGS[format][s.name];
  const mark = (at: string | number) => (typeof at === "number" ? at : log.marks[at]) - s.from;
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(`footage/${format}/${s.name}.mp4`)} trimBefore={s.from} />
      <Touches log={log as TouchLog} offset={s.from} />
      {s.caps.map((c, i) => {
        // never during the incoming crossfade (the previous caption is still fading), and
        // always gone before the scene's next caption starts
        const start = (k: number) => Math.max(XFADE + 2, mark(s.caps[k].at) - 4);
        const len = i + 1 < s.caps.length ? Math.min(c.for, start(i + 1) - start(i) - 1) : c.for;
        return (
          <Sequence key={i} from={start(i)} durationInFrames={len} layout="none">
            <Caption lines={c.lines} duration={len} y={CAPTION_Y[format]} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** The Blender opening: dark room, the glow comes up, the camera settles on the desk. */
const Hook: React.FC<{ format: Format }> = ({ format }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: interpolate(f, [0, 6], [0, 1], { extrapolateRight: "clamp" }) }}>
        <OffthreadVideo src={staticFile(`hook/${format}.mp4`)} muted />
      </AbsoluteFill>
      {/* on screen within the first second; gone before the cut's crossfade starts */}
      <Sequence from={10} durationInFrames={HOOK_FRAMES - 10 - XFADE} layout="none">
        <Caption lines={["my website", "is my desk."]} duration={HOOK_FRAMES - 10 - XFADE} y={CAPTION_Y[format]} size={70} />
      </Sequence>
    </AbsoluteFill>
  );
};

const t = (key: string) => <TransitionSeries.Transition key={key} presentation={fade()} timing={linearTiming({ durationInFrames: XFADE })} />;

export const Story: React.FC<{ format: Format }> = ({ format }) => (
  <AbsoluteFill style={{ background: "#0a0a0b" }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={HOOK_FRAMES} name="hook">
        <Hook format={format} />
      </TransitionSeries.Sequence>
      {SCENES.flatMap((s) => [
        t(`x-${s.name}`),
        <TransitionSeries.Sequence key={s.name} durationInFrames={frames(format, s)} name={s.name}>
          <Clip format={format} s={s} />
        </TransitionSeries.Sequence>,
      ])}
      {t("x-outro")}
      <TransitionSeries.Sequence durationInFrames={OUTRO_FRAMES} name="outro">
        <Outro format={format} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
