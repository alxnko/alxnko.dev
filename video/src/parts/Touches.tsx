// The finger: every tap, drag and pinch from the capture log, drawn where and when it
// happened, so a muted viewer sees exactly what was touched.
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C } from "../brand";

export type TouchLog = {
  taps: { f: number; x: number; y: number }[];
  drags: { f0: number; f1: number; pts: [number, number, number][] }[];
  pinches?: { f0: number; f1: number; pts: [number, number, number, number, number][] }[];
};

const R = 46;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Dot: React.FC<{ x: number; y: number; o: number; s?: number }> = ({ x, y, o, s = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x - R,
      top: y - R,
      width: R * 2,
      height: R * 2,
      borderRadius: "50%",
      background: "rgba(237,237,235,0.30)",
      border: "4px solid rgba(237,237,235,0.92)",
      boxShadow: `0 0 0 3px rgba(10,10,11,0.35), 0 0 28px ${C.green}66`,
      opacity: o,
      scale: String(s),
    }}
  />
);

/** `offset`: the clip's first frame in capture frames (trimmed footage). */
export const Touches: React.FC<{ log: TouchLog; offset: number }> = ({ log, offset }) => {
  const f = useCurrentFrame() + offset;
  const nodes: React.ReactNode[] = [];
  // taps: the finger lands a little before the capture's tap, then a ripple
  log.taps.forEach((t, i) => {
    const d = f - t.f;
    if (d < -6 || d > 16) return;
    nodes.push(<Dot key={`t${i}`} x={t.x} y={t.y} o={interpolate(d, [-6, -2, 4, 16], [0, 1, 1, 0], clamp)} s={interpolate(d, [-6, 0, 3], [1.25, 0.82, 0.9], clamp)} />);
    if (d >= 0)
      nodes.push(
        <div
          key={`r${i}`}
          style={{
            position: "absolute",
            left: t.x - R,
            top: t.y - R,
            width: R * 2,
            height: R * 2,
            borderRadius: "50%",
            border: `4px solid ${C.green}`,
            opacity: interpolate(d, [0, 14], [0.9, 0], clamp),
            scale: String(interpolate(d, [0, 14], [1, 2.3], clamp)),
          }}
        />,
      );
  });
  // drags and pinches: the finger follows its path, fading in before and out after
  const path = (key: string, pts: [number, number, number][]) => {
    const first = pts[0], lastP = pts[pts.length - 1];
    if (f < first[0] - 6 || f > lastP[0] + 8) return;
    const p = f <= first[0] ? first : f >= lastP[0] ? lastP : pts.find((q) => q[0] >= f) ?? lastP;
    nodes.push(<Dot key={key} x={p[1]} y={p[2]} o={interpolate(f, [first[0] - 6, first[0] - 1, lastP[0], lastP[0] + 8], [0, 1, 1, 0], clamp)} s={f < first[0] ? interpolate(f, [first[0] - 6, first[0]], [1.2, 0.9], clamp) : 0.9} />);
  };
  log.drags.forEach((d, i) => path(`d${i}`, d.pts));
  (log.pinches ?? []).forEach((p, i) => {
    path(`pa${i}`, p.pts.map((q) => [q[0], q[1], q[2]]));
    path(`pb${i}`, p.pts.map((q) => [q[0], q[3], q[4]]));
  });
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{nodes}</AbsoluteFill>;
};
