"""Poster screen textures (plain python3 + ImageMagick, no Blender).

python3 scene/screens.py  ->  $WORK/screen-laptop.png (1600x1000, 16:10)
                              $WORK/screen-monitor.png (2560x1072, 0.80:0.335)
                              $WORK/fonts/*.ttf (JetBrains Mono / VT323 from @fontsource woff2)

The laptop shows the terminal (`fastfetch` with the ASCII cat), the monitor the
contacts screen from spec §6.5. Content = public facts only (plan, global constraints).
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


def laptop(path: Path):
    W, H = 1600, 1000
    size, lh = 30, 44
    cw = size * 0.6
    p = [("[alxnko@nitro ", ANSI["green"], True), ("~", ANSI["blue"], True), ("]$ ", ANSI["green"], True)]
    cat = ["", "    /\\_/\\", "   ( o.o )", "    > ^ <", "   /     \\", "  (|     |)", "   \\_/-\\_/"]
    cat = [c.ljust(16) for c in cat]
    info = [
        [("alxnko", ANSI["green"], True), ("@", ANSI["fg"], False), ("nitro", ANSI["green"], True)],
        [("------------", ANSI["dim"], False)],
        [("name   ", ANSI["blue"], True), ("Alex Neko", ANSI["fg"], False)],
        [("role   ", ANSI["blue"], True), ("tech lead @ AIT Solutions", ANSI["fg"], False)],
        [("os     ", ANSI["blue"], True), ("meowOS x86_64", ANSI["fg"], False)],
        [("host   ", ANSI["blue"], True), ("nitro", ANSI["fg"], False)],
        [("shell  ", ANSI["blue"], True), ("bash", ANSI["fg"], False)],
        [("loc    ", ANSI["blue"], True), ("Kyrgyzstan 42.87N 74.59E", ANSI["fg"], False)],
        [("rank   ", ANSI["blue"], True), ("#1 committer in Kyrgyzstan", ANSI["amber"], False)],
    ]
    lines = [p + [("fastfetch", ANSI["fg"], False)], []]
    for i in range(max(len(cat), len(info))):
        left = [(cat[i] if i < len(cat) else " " * 16, ANSI["muted"], False), ("   ", ANSI["fg"], False)]
        lines.append(left + (info[i] if i < len(info) else []))
    lines.append([])
    blocks = [("   ", c, False) for c in ()]  # colour row drawn as rectangles below
    del blocks
    lines += [[], p + [("ls ~/monitor", ANSI["fg"], False)],
              [("github.lnk  telegram.lnk  linkedin.lnk  instagram.lnk  email.lnk", ANSI["cyan"], False)],
              p]
    x0, y0 = 56, 92
    args = ["magick", "-size", f"{W}x{H}", f"xc:{ANSI['bg']}"]
    # thin title bar like a tiling-WM terminal (no traffic lights)
    args += ["-fill", G["900"], "-draw", f"rectangle 0,0 {W},40",
             "-fill", G["750"], "-draw", f"rectangle 0,40 {W},41"]
    args += ["-font", str(MONO), "-fill", ANSI["dim"], "-pointsize", "20", "-annotate", "+24+27",
             "alxnko@nitro: ~"]
    args += text_cmds(lines, x0, y0 + 20, size, lh, cw)
    # palette row under the facts
    by = y0 + 20 + 11 * lh - 26
    bx = x0 + cw * 19
    for i, c in enumerate(["black", "red", "green", "amber", "blue", "magenta", "cyan", "white"]):
        args += ["-fill", ANSI[c], "-draw", f"rectangle {bx + i * 44:.0f},{by} {bx + i * 44 + 38:.0f},{by + 26}"]
    # cursor after the last prompt
    last = len(lines) - 1
    cx = x0 + cw * len("[alxnko@nitro ~]$ ")
    cy = y0 + 20 + last * lh
    args += ["-fill", ANSI["green"], "-draw", f"rectangle {cx:.0f},{cy - 26} {cx + cw:.0f},{cy + 6}"]
    args += [str(path)]
    subprocess.run(args, check=True)


MARK = {  # brand mark polygons on the 256 px grid (catuser.png)
    "head": [(67, 75), (128, 23), (189, 75), (128, 120)],
    "earL": [(67, 20), (67, 55), (92, 33)],
    "earR": [(189, 20), (189, 55), (164, 33)],
    "bodyL": [(89, 112), (122, 131), (122, 251), (52, 200)],
    "bodyR": [(166, 112), (134, 131), (134, 251), (203, 200)],
    "tail": [(190, 100), (237, 157), (213, 187), (190, 133)],
}


def mark_draw(x, y, scale, col):
    out = ["-fill", col, "-stroke", "none"]
    for poly in MARK.values():
        pts = " ".join(f"{x + px * scale:.1f},{y + py * scale:.1f}" for px, py in poly)
        out += ["-draw", f"polygon {pts}"]
    return out


def monitor(path: Path):
    W, H = 2560, 1072
    bar = 44
    args = ["magick", "-size", f"{W}x{H}", f"xc:{ANSI['bg']}"]
    # top bar: workspaces 1 2 3 (1 active, green underline), clock, kg
    args += ["-fill", G["900"], "-draw", f"rectangle 0,0 {W},{bar}", "-fill", G["750"],
             "-draw", f"rectangle 0,{bar} {W},{bar + 1}"]
    for i, ws in enumerate("123"):
        x = 28 + i * 52
        args += ["-font", str(MONO_B if i == 0 else MONO), "-pointsize", "24",
                 "-fill", ANSI["fg"] if i == 0 else ANSI["dim"], "-annotate", f"+{x}+31", ws]
    args += ["-fill", GREEN, "-draw", "rectangle 22,39 50,42"]
    args += ["-font", str(MONO), "-pointsize", "24", "-fill", ANSI["muted"],
             "-annotate", f"+{W - 420}+31", "42.87N 74.59E   kg   13:37"]
    # panes
    split = 1340
    args += ["-fill", G["750"], "-draw", f"rectangle {split},{bar + 24} {split + 1},{H - 24}"]
    size, lh = 34, 58
    cw = size * 0.6
    lines = [[("~/monitor", ANSI["blue"], True)], [("contacts", ANSI["dim"], False)], []]
    rows = [("gh", "github.com/alxnko"), ("tg", "t.me/ALXNK0"), ("in", "linkedin.com/in/alxnko"),
            ("ig", "instagram.com/alxnko"), ("mail", "aleksandrnyrko@gmail.com")]
    for short, url in rows:
        lines.append([(f"{short:<6}", ANSI["dim"], True), (url, ANSI["green"] if short == "gh" else ANSI["fg"], False)])
        lines.append([])
    args += text_cmds(lines, 300, bar + 110, size, lh, cw)
    # right pane: fastfetch-style card with the cat mark
    args += mark_draw(split + 110, bar + 170, 1.55, GREEN)
    info = [[("Alex Neko", ANSI["fg"], True)], [("alxnko", ANSI["dim"], False)], [],
            [("tech lead", ANSI["fg"], False)], [("AIT Solutions", ANSI["muted"], False)], [],
            [("Kyrgyzstan", ANSI["fg"], False)], [("#1 committer in KG", ANSI["amber"], False)]]
    args += text_cmds(info, split + 560, bar + 230, 34, 58, 20.4)
    args += [str(path)]
    subprocess.run(args, check=True)


def main():
    global MONO, MONO_B
    MONO = ttf("jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2", "JetBrainsMono-Regular.ttf")
    MONO_B = ttf("jetbrains-mono", "jetbrains-mono-latin-700-normal.woff2", "JetBrainsMono-Bold.ttf")
    ttf("vt323", "vt323-latin-400-normal.woff2", "VT323-Regular.ttf")
    WORK.mkdir(parents=True, exist_ok=True)
    laptop(WORK / "screen-laptop.png")
    monitor(WORK / "screen-monitor.png")
    print("[screens] wrote", WORK / "screen-laptop.png", WORK / "screen-monitor.png")


if __name__ == "__main__":
    main()
