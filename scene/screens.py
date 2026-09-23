"""Poster screen textures (plain python3 + ImageMagick, no Blender).

python3 scene/screens.py  ->  $WORK/screen-laptop.png (1600x1000, 16:10)
                              $WORK/screen-monitor.png (2560x1072, 0.80:0.335)
                              $WORK/fonts/*.ttf (JetBrains Mono / VT323 from @fontsource woff2)

The laptop shows the docked terminal after boot (`fastfetch --compact` beside the
ASCII cat mark from src/content/mark.ts), the monitor mirrors src/scene/monitor-screen.ts
plus the contacts panel, $WORK/fan-display.png the fan readout ("100"). Content = public facts only (plan, global constraints).
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(os.environ.get("ALXNKO_SCENE_WORK", "/var/tmp/alxnko-scene"))
FONTS = WORK / "fonts"
T = json.loads((ROOT / "design" / "tokens.json").read_text())
ANSI = T["ansi"]
G = T["primitive"]["graphite"]
GREEN = T["primitive"]["green"]


def ttf(pkg: str, file: str, out: str) -> Path:
    """@fontsource ships woff2 only: convert once with fontTools (brotli)."""
    dst = FONTS / out
    if not dst.exists():
        from fontTools.ttLib import TTFont
        FONTS.mkdir(parents=True, exist_ok=True)
        f = TTFont(ROOT / "node_modules" / "@fontsource" / pkg / "files" / file)
        f.flavor = None
        f.save(dst)
    return dst


MONO = None
MONO_B = None


def text_cmds(lines, x0, y0, size, lh, cw):
    """lines: list of list of (text, colour, bold). Returns magick draw args."""
    args = []
    for i, spans in enumerate(lines):
        x = x0
        for text, col, bold in spans:
            lead = len(text) - len(text.lstrip(" "))
            body = text.strip(" ")
            if body:
                safe = body.replace("\\", "\\\\").replace("%", "%%")
                args += ["-font", str(MONO_B if bold else MONO), "-fill", col, "-pointsize", str(size),
                         "-annotate", f"+{x + lead * cw:.0f}+{y0 + i * lh:.0f}", safe]
            x += cw * len(text)
        del x
    return args


def cat_mark() -> list[str]:
    """The half-block brand mark, read from src/content/mark.ts (single source of truth)."""
    import re
    src = (ROOT / "src" / "content" / "mark.ts").read_text(encoding="utf-8")
    body = src[src.index("CAT_MARK"):]
    body = body[body.index("[") + 1:body.index("];")]
    out = [m.group(1).replace("\\\\", "\\").replace("\\'", "'")
           for m in re.finditer(r"'((?:[^'\\]|\\.)*)'", body)]
    assert len(out) >= 8, out
    return out


def blocks(lines, x0, top0, cw, ch, col):
    """Draw half-block art as exact rectangles (what the terminal shows): one cell is
    cw x ch, '█' fills it, '▀' the top half, '▄' the bottom half."""
    args = ["-fill", col, "-stroke", "none"]
    for i, ln in enumerate(lines):
        for j, c in enumerate(ln):
            x, y = x0 + j * cw, top0 + i * ch
            span = {"█": (0, 1), "▀": (0, 0.5), "▄": (0.5, 1)}.get(c)
            if span:
                args += ["-draw", f"rectangle {x:.1f},{y + span[0] * ch:.1f} {x + cw - 0.01:.1f},"
                                  f"{y + span[1] * ch - 0.01:.1f}"]
    return args


def prompt(cmd=None):
    p = [("[", ANSI["fg"], False), ("alxnko@nitro", ANSI["fg"], True), (" ", ANSI["fg"], False),
         ("~", ANSI["green"], False), ("]$ ", ANSI["fg"], False)]
    return p + ([(cmd, ANSI["fg"], False)] if cmd else [])


def laptop(path: Path):
    """The docked terminal right after boot: `fastfetch --compact` beside the cat mark."""
    W, H = 1600, 1000
    size, lh = 30, 42
    cw = size * 0.6
    cat = cat_mark()
    kv = lambda k, v, c=None: [(f"{k:<7}", ANSI["blue"], True), (v, c or ANSI["fg"], False)]  # noqa: E731
    rows = [
        [("alxnko", ANSI["green"], True), ("@", ANSI["fg"], False), ("nitro", ANSI["green"], True)],
        [("-" * 12, ANSI["fg"], False)],
        kv("os", "meowOS x86_64"),
        kv("host", "nitro"),
        kv("kernel", "7.2.6-meow"),
        kv("uptime", "3 mins"),
        kv("shell", "bash 5.3"),
        kv("role", "tech lead"),
        kv("loc", "Kyrgyzstan"),
        kv("rank", "#1 committer in KG"),
    ]
    width = max(len(c) for c in cat)
    lines = [prompt("fastfetch --compact")]
    for i in range(max(len(cat), len(rows))):
        art = [(" " * (width + 3), ANSI["fg"], False)]
        lines.append(art + (rows[i] if i < len(rows) else []))
    lines += [[], prompt()]
    x0, y0 = 48, 70
    args = ["magick", "-size", f"{W}x{H}", f"xc:{ANSI['bg']}"]
    args += text_cmds(lines, x0, y0, size, lh, cw)
    args += blocks(cat, x0, y0 + lh - size * 0.95, cw, lh, ANSI["green"])
    # link underline under the rank value (links render underlined, dim)
    ri = 1 + 9
    ux = x0 + cw * (width + 3 + 7)
    uy = y0 + ri * lh + 6
    args += ["-fill", ANSI["dim"], "-draw", f"rectangle {ux:.0f},{uy} {ux + cw * 18:.0f},{uy + 1}"]
    # block cursor after the last prompt
    last = len(lines) - 1
    cx = x0 + cw * len("[alxnko@nitro ~]$ ")
    cy = y0 + last * lh
    args += ["-fill", ANSI["fg"], "-draw", f"rectangle {cx:.0f},{cy - 24} {cx + cw:.0f},{cy + 6}"]
    args += [str(path)]
    subprocess.run(args, check=True)


def monitor(path: Path):
    """Mirror of src/scene/monitor-screen.ts (2048x858 canvas, drawn here at 1.25x) plus
    the contacts panel the live site pins on the middle of the curve (CONTACTS_UV)."""
    k = 1.25
    W, H = 2560, 1072
    LEFT, RIGHT, TOP = 0.24 * W, 0.76 * W, 0.12 * H
    sc = lambda v: v * k  # noqa: E731
    args = ["magick", "-size", f"{W}x{H}", f"xc:{ANSI['bg']}"]
    # bar across the whole panel: workspaces (2 active), title, clock
    args += ["-fill", G["900"], "-draw", f"rectangle 0,0 {W},{TOP * 0.62:.0f}"]
    by = TOP * 0.31 + sc(9)
    for i, n in enumerate("123"):
        x = sc(44 + i * 40)
        args += ["-font", str(MONO), "-pointsize", f"{sc(24):.0f}", "-fill", ANSI["white"] if i == 1 else ANSI["dim"],
                 "-annotate", f"+{x:.0f}+{by:.0f}", n]
        if i == 1:
            args += ["-fill", ANSI["green"], "-draw",
                     f"rectangle {x - sc(3):.0f},{TOP * 0.62 - sc(4):.0f} {x + sc(17):.0f},{TOP * 0.62:.0f}"]
    args += ["-fill", ANSI["muted"], "-gravity", "NorthWest"]
    tw = sc(24) * 0.6
    args += ["-annotate", f"+{W / 2 - tw * 4.5:.0f}+{by:.0f}", "~/monitor",
             "-annotate", f"+{W - sc(44) - tw * 9:.0f}+{by:.0f}", "kg  13:37"]
    # pane rules
    args += ["-fill", G["800"], "-draw", f"rectangle {LEFT - sc(2):.0f},{TOP:.0f} {LEFT:.0f},{H - sc(40):.0f}",
             "-draw", f"rectangle {RIGHT:.0f},{TOP:.0f} {RIGHT + sc(2):.0f},{H - sc(40):.0f}"]
    # left pane: the ASCII mark in green + handle@host
    cat = cat_mark()
    msz = sc(30)
    mcw = msz * 0.6
    mx = (LEFT - mcw * max(len(c) for c in cat)) / 2
    args += blocks(cat, mx, TOP + sc(150) - msz * 0.8, mcw, sc(38), ANSI["green"])
    hy = TOP + sc(150) + len(cat) * sc(38) + sc(50) + sc(10)
    hsz = sc(28)
    args += text_cmds([[("alxnko@nitro", ANSI["white"], True)]], LEFT / 2 - hsz * 0.6 * 6, hy, hsz, 0, hsz * 0.6)
    # centre: the contacts panel (DOM on the live site)
    csz, clh = sc(30), sc(62)
    ccw = csz * 0.6
    cx0 = LEFT + sc(96)
    lines = [[("contacts", ANSI["dim"], False)], []]
    rows = [("gh", "github.com/alxnko"), ("tg", "t.me/ALXNK0"), ("in", "linkedin.com/in/alxnko"),
            ("ig", "instagram.com/alxnko"), ("mail", "aleksandrnyrko@gmail.com")]
    for short, url in rows:
        lines.append([(f"{short:<6}", ANSI["dim"], True), (url, ANSI["fg"], False)])
    cy0 = TOP + sc(120)
    args += text_cmds(lines, cx0, cy0, csz, clh, ccw)
    for i in range(len(rows)):
        y = cy0 + (2 + i) * clh + sc(18)
        args += ["-fill", G["800"], "-draw", f"rectangle {cx0:.0f},{y:.0f} {RIGHT - sc(96):.0f},{y + 1:.0f}"]
        ax = RIGHT - sc(120)
        ay = cy0 + (2 + i) * clh - sc(10)
        args += ["-stroke", ANSI["dim"], "-strokewidth", "2", "-fill", "none", "-draw",
                 f"polyline {ax - 8:.0f},{ay + 8:.0f} {ax + 8:.0f},{ay - 8:.0f}",
                 "-draw", f"polyline {ax - 4:.0f},{ay - 8:.0f} {ax + 8:.0f},{ay - 8:.0f} {ax + 8:.0f},{ay + 4:.0f}",
                 "-stroke", "none"]
    # right pane: role / loc / rank
    rx = RIGHT + sc(48)
    for i, (key, val) in enumerate((("role", "tech lead"), ("loc", "Kyrgyzstan"), ("rank", "#1 committer in KG"))):
        y = TOP + sc(120) + i * sc(96)
        args += text_cmds([[(key, ANSI["dim"], False)]], rx, y + sc(9), sc(24), 0, sc(24) * 0.6)
        args += text_cmds([[(val, ANSI["amber"] if key == "rank" else ANSI["fg"], False)]], rx, y + sc(36) + sc(10),
                          sc(28), 0, sc(28) * 0.6)
    args += [str(path)]
    subprocess.run(args, check=True)


def fan_display(path: Path, text="100"):
    """Mirror of FanDisplay in src/scene/monitor-screen.ts (256x128)."""
    subprocess.run(["magick", "-size", "256x128", "xc:#050506", "-font", str(MONO_B), "-pointsize", "84",
                    "-fill", ANSI["white"], "-gravity", "center", "-annotate", "+0+4", text, str(path)], check=True)


def main():
    global MONO, MONO_B
    MONO = ttf("jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2", "JetBrainsMono-Regular.ttf")
    MONO_B = ttf("jetbrains-mono", "jetbrains-mono-latin-700-normal.woff2", "JetBrainsMono-Bold.ttf")
    ttf("vt323", "vt323-latin-400-normal.woff2", "VT323-Regular.ttf")
    WORK.mkdir(parents=True, exist_ok=True)
    laptop(WORK / "screen-laptop.png")
    monitor(WORK / "screen-monitor.png")
    fan_display(WORK / "fan-display.png")
    print("[screens] wrote", WORK / "screen-laptop.png", WORK / "screen-monitor.png")


if __name__ == "__main__":
    main()
