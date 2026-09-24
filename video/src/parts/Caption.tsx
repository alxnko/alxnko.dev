// The one caption style: a terminal line that types itself in (green prompt, block cursor),
// on a graphite plate so it reads over any frame, day or night.
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { C, MONO } from "../brand";

type Props = {
  lines: string[];
  /** frames this caption is on screen */
  duration: number;
  y: number;
  size?: number;
};

const CPS = 32; // characters per second while typing

export const Caption: React.FC<Props> = ({ lines, duration, y, size = 58 }) => {
  const frame = useCurrentFrame();
  const total = lines.join("").length;
  const shown = Math.floor((frame / 30) * CPS);
  const typing = shown < total;
  const cursorOn = typing || Math.floor(frame / 15) % 2 === 0;
  let left = shown;
  const out = lines.map((l) => {
    const s = l.slice(0, Math.max(0, left));
    left -= l.length;
    return s;
  });
  const last = out.reduce((k, s, i) => (s.length ? i : k), 0);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: y,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(frame, [0, 5, duration - 6, duration], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 8], ["0px 18px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            padding: "22px 34px 24px",
            borderRadius: 10,
            background: "rgba(10,10,11,0.84)",
            border: `2px solid ${C.lineStrong}`,
            boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            fontFamily: MONO,
            fontSize: size,
            lineHeight: 1.3,
            color: C.fg,
            letterSpacing: "-0.01em",
          }}
        >
          {lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: "pre", minHeight: "1.3em" }}>
              {i === 0 ? <span style={{ color: C.green }}>{"› "}</span> : <span>{"  "}</span>}
              {/* reserve the full line width so the plate never grows while typing */}
              <span style={{ position: "relative" }}>
                <span style={{ visibility: "hidden" }}>{l}</span>
                <span style={{ position: "absolute", left: 0, top: 0 }}>
                  {out[i]}
                  {i === last && cursorOn ? (
                    <span style={{ background: C.green, color: C.bg, marginLeft: 2 }}>{" "}</span>
                  ) : null}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
