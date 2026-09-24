// The end card: the cat mark builds row by row (like fastfetch), then the name and the URL.
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { C, CAT_MARK, MARK, MONO, type Format } from "../brand";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Mark: React.FC<{ cell: number; rows: number }> = ({ cell, rows }) => {
  const w = CAT_MARK[0].length, cw = cell, ch = cell * 2.1;
  return (
    <svg width={w * cw} height={CAT_MARK.length * ch} style={{ overflow: "visible" }}>
      <path
        fill={C.green}
        d={CAT_MARK.slice(0, rows)
          .flatMap((l, r) =>
            [...l].map((c, i) => {
              const x = i * cw, y = r * ch;
              if (c === "█") return `M${x} ${y}h${cw}v${ch}h${-cw}z`;
              if (c === "▀") return `M${x} ${y}h${cw}v${ch / 2}h${-cw}z`;
              if (c === "▄") return `M${x} ${y + ch / 2}h${cw}v${ch / 2}h${-cw}z`;
              return "";
            }),
          )
          .join("")}
      />
    </svg>
  );
};

export const Outro: React.FC<{ format: Format }> = ({ format }) => {
  const f = useCurrentFrame();
  const tall = format === "9x16";
  const rows = Math.min(CAT_MARK.length, Math.floor(interpolate(f, [2, 16], [0, CAT_MARK.length], clamp)));
  const url = "alxnko.dev", urlShown = url.slice(0, Math.floor(interpolate(f, [22, 34], [0, url.length], clamp)));
  const up = (a: number) => ({
    opacity: interpolate(f, [a, a + 8], [0, 1], clamp),
    translate: interpolate(f, [a, a + 10], ["0px 22px", "0px 0px"], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
  });
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center", fontFamily: MONO, color: C.fg }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: tall ? 44 : 30, marginTop: tall ? -60 : -20 }}>
        <Mark cell={tall ? 26 : 20} rows={rows} />
        <div style={{ fontFamily: MARK, fontSize: tall ? 170 : 132, lineHeight: 0.9, ...up(12) }}>
          alxnko<span style={{ color: C.green, opacity: Math.floor(f / 15) % 2 === 0 ? 1 : 0 }}>_</span>
        </div>
        <div style={{ fontSize: tall ? 76 : 62, fontWeight: 700, letterSpacing: "-0.01em", minHeight: "1.2em" }}>
          {urlShown}
        </div>
        <div style={{ fontSize: tall ? 42 : 36, color: C.muted, ...up(40) }}>
          <span style={{ color: C.green }}>$ </span>type meow
        </div>
      </div>
    </AbsoluteFill>
  );
};
