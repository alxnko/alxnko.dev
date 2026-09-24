"""Encode, content-hash and publish the scene outputs + write manifest.json.

python3 scene/finalize.py      (plain python3 + ImageMagick + avifenc; no Blender)

  public/scene/desk.<sha8>.glb
  public/scene/atlas-{day,night}-{2048,1024}.<sha8>.webp
  public/scene/poster-{day,night}-{1600,800}.<sha8>.{avif,webp}
  public/scene/manifest.json          public/og.png
Budgets (plan Tasks 3-4) are enforced by stepping quality down; a miss is fatal.
Stale hashed files in public/scene are removed.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(os.environ.get("ALXNKO_SCENE_WORK", "/var/tmp/alxnko-scene"))
PUB = ROOT / "public" / "scene"
T = json.loads((ROOT / "design" / "tokens.json").read_text())
KB = 1024
BUDGET = {"glb": 250 * KB, "atlas-1024": 120 * KB, "atlas-2048": 450 * KB,
          "poster-1600-avif": 90 * KB, "poster-800-avif": 45 * KB}
MAX_TRIS = 40_000


def sh(*args):
    subprocess.run([str(a) for a in args], check=True, stdout=subprocess.DEVNULL)


def sha8(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:8]


def publish(src: Path, stem: str, ext: str, out: dict) -> str:
    name = f"{stem}.{sha8(src)}.{ext}"
    shutil.copyfile(src, PUB / name)
    out[name] = src.stat().st_size
    return name


def webp(src: Path, dst: Path, size: int | None, q: int, limit: int | None, lossless_alpha=False) -> int:
    while True:
        args = ["magick", src]
        if size:
            args += ["-filter", "Lanczos", "-resize", f"{size}x{size}"]
        args += ["-strip", "-quality", str(q), "-define", "webp:method=6", "-define", "webp:use-sharp-yuv=true", dst]
        sh(*args)
        n = dst.stat().st_size
        if limit is None or n <= limit:
            return q
        if q <= 40:
            raise SystemExit(f"budget miss: {dst.name} {n} > {limit} even at q{q}")
        q -= 4


def avif(src: Path, dst: Path, q: int, limit: int | None) -> int:
    while True:
        sh("avifenc", "-q", q, "-s", "4", "-j", "1", "--ignore-exif", "--ignore-xmp", src, dst)
        n = dst.stat().st_size
        if limit is None or n <= limit:
            return q
        if q <= 30:
            raise SystemExit(f"budget miss: {dst.name} {n} > {limit} even at q{q}")
        q -= 4


def text_w(font: Path, size: int, text: str) -> int:
    out = subprocess.run(["magick", "-font", str(font), "-pointsize", str(size), f"label:{text}",
                          "-format", "%w", "info:"], check=True, capture_output=True, text=True)
    return int(out.stdout.strip())


def og(poster_night: Path, dst: Path):
    fonts = WORK / "fonts"
    bg, line = T["semantic"]["dark"]["bg"], T["semantic"]["dark"]["line"]
    fg, muted = T["semantic"]["dark"]["fg"], T["semantic"]["dark"]["fgMuted"]
    green = T["primitive"]["green"]
    tmp = WORK / "og-render.png"
    # 780x630 window of the night poster: from the fan + cat on the left edge across the desk
    sh("magick", poster_night, "-crop", "1238x1000+40+0", "+repage", "-resize", "780x630!", tmp)
    sh("magick", "-size", "1200x630", f"xc:{bg}", tmp, "-geometry", "+420+0", "-composite",
       "-fill", line, "-draw", "rectangle 420,0 420,630",
       "-font", fonts / "VT323-Regular.ttf", "-pointsize", "112", "-fill", fg, "-annotate", "+56+318", "alxnko",
       "-fill", green, "-annotate", f"+{56 + text_w(fonts / 'VT323-Regular.ttf', 112, 'alxnko')}+318", "_",
       "-font", fonts / "JetBrainsMono-Regular.ttf", "-pointsize", "26", "-fill", muted,
       "-annotate", "+60+372", "tech lead · kyrgyzstan",
       "-font", fonts / "JetBrainsMono-Regular.ttf", "-pointsize", "18", "-fill", T["semantic"]["dark"]["fgSubtle"],
       "-annotate", "+60+566", "alxnko.dev",
       "-strip", "-define", "png:compression-level=9", dst)
    tmp.unlink()


def main():
    PUB.mkdir(parents=True, exist_ok=True)
    enc = WORK / "enc"
    enc.mkdir(exist_ok=True)
    sizes: dict[str, int] = {}
    files: dict = {"atlas": {}, "poster": {}}
    quality: dict = {}

    # glb
    glb_src = WORK / "desk-opt.glb"
    stats = json.loads((WORK / "glb-stats.json").read_text())
    assert glb_src.stat().st_size <= BUDGET["glb"], f"glb {glb_src.stat().st_size} > budget"
    assert stats["tris"] <= MAX_TRIS, f"tris {stats['tris']} > {MAX_TRIS}"
    files["glb"] = publish(glb_src, "desk", "glb", sizes)
    version = files["glb"].split(".")[1]

    # atlases (bake-size master -> 2048 / 1024; keep a 2048 PNG for the Blender re-import check)
    bake_size = json.loads((WORK / "bake-info.json").read_text())["size"]
    for rig in ("day", "night"):
        master = WORK / f"atlas-{rig}-{bake_size}.png"
        files["atlas"][rig] = {}
        if bake_size != 2048:
            sh("magick", master, "-filter", "Lanczos", "-resize", "2048x2048", WORK / f"atlas-{rig}-2048.png")
        for size, q0 in ((2048, 82), (1024, 78)):
            dst = enc / f"atlas-{rig}-{size}.webp"
            quality[f"atlas-{rig}-{size}"] = webp(master, dst, size, q0, BUDGET[f"atlas-{size}"])
            files["atlas"][rig][str(size)] = publish(dst, f"atlas-{rig}-{size}", "webp", sizes)

    # posters: 1600x1000 (cam_desk, 16:10) + 800x1000 portrait (cam_desk, same hfov)
    crop = json.loads((WORK / "poster-portrait.json").read_text())
    for rig in ("day", "night"):
        src = WORK / f"poster-{rig}.png"
        files["poster"][rig] = {"1600": {}, "800": {}}
        port = WORK / f"poster-{rig}-portrait.png"
        for key, img in (("1600", src), ("800", port)):
            a = enc / f"poster-{rig}-{key}.avif"
            quality[f"poster-{rig}-{key}-avif"] = avif(img, a, 60, BUDGET[f"poster-{key}-avif"])
            files["poster"][rig][key]["avif"] = publish(a, f"poster-{rig}-{key}", "avif", sizes)
            w = enc / f"poster-{rig}-{key}.webp"
            quality[f"poster-{rig}-{key}-webp"] = webp(img, w, None, 80, None)
            files["poster"][rig][key]["webp"] = publish(w, f"poster-{rig}-{key}", "webp", sizes)

    og(WORK / "poster-night.png", ROOT / "public" / "og.png")
    sizes["../og.png"] = (ROOT / "public" / "og.png").stat().st_size

    # stale hashed files
    keep = {k for k in sizes if not k.startswith("..")}
    pat = re.compile(r"^(desk|atlas-.+|poster-.+)\.[0-9a-f]{8}\.(glb|webp|avif)$")
    for f in PUB.iterdir():
        if pat.match(f.name) and f.name not in keep:
            f.unlink()
            print("[finalize] removed stale", f.name)

    info = json.loads((WORK / "export-info.json").read_text())
    bake = json.loads((WORK / "bake-info.json").read_text())
    manifest = build_manifest(version, files, info, bake, crop, stats, sizes, quality)
    (PUB / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"sizes": sizes, "quality": quality, "tris": stats["tris"]}, indent=1))


def build_manifest(version, files, info, bake, crop, stats, sizes, quality):
    sl, sm = info["screenLaptop"], info["screenMonitor"]
    return {
        "version": version,
        "deskBase": info["deskBase"],
        "presets": info["presets"],
        "range": info["range"],
        "step": info["step"],
        "fanAxis": [0, 0, 1],
        "screens": {
            "laptop": {"w": sl["w"], "h": sl["h"], "node": "screen_laptop", "aspect": "16:10",
                       "cornersLocal": sl["cornersLocal"], "cornersRig": sl["cornersRig"],
                       "normalLocal": sl["normalLocal"]},
            "monitor": {"w": sm["w"], "h": sm["h"], "radius": 1.5, "node": "screen_monitor",
                        "radiusMesh": sm["radius"], "arcRad": sm["arcRad"],
                        "curvatureCenterLocal": sm["curvatureCenterLocal"], "axisLocal": sm["axisLocal"],
                        "cornersLocal": sm["cornersLocal"], "cornersRig": sm["cornersRig"], "uv": sm["uv"],
                        "yawDeg": sm.get("yawDeg", 0.0)},
        },
        "files": {"glb": files["glb"], "atlas": files["atlas"], "poster": files["poster"], "og": "/og.png"},
        "posters": {
            "camera": "cam_desk", "size": [1600, 1000], "deskHeight": info["deskBase"], "theme": {"dark": "night", "light": "day"},
            "portrait": crop, "ring": "green", "tint": json.loads((ROOT / "design" / "rgb.json").read_text())["green"]["tint"], "fanRing": "green", "backlight": "green", "fanDisplay": "100",
            "screens": "laptop: `fastfetch --compact` terminal; monitor: bar + cat mark | contacts | role/loc/rank",
            "note": "rendered from the baked atlas (unlit) + screens/ring/glow/fan ring/fan readout/keyboard backlights/LEDs, so the live scene matches at the desk landmark",
        },
        "axes": {
            "units": "m", "up": "+Y", "right": "+X", "front": "+Z (the viewer/chair side; the back wall is at -Z)",
            "origin": "floor, under the centre of the desk top", "handedness": "right (glTF)",
            "fanAxis": "fan_blades local +Z",
            "uvScreens": "screen_laptop / screen_monitor TEXCOORD_0 is standard glTF: stored (0,0) = top-left, (1,1) = bottom-right of the visible image (Blender UV (0,0) = bottom-left) -> CanvasTexture with flipY=false",
            "uvSky": "window_sky / ring_glow TEXCOORD_0 stored (0,0) = bottom-left as seen from the room: vUv.y = up",
            "uvAtlas": "TEXCOORD_0 standard glTF (flipY=false); atlas is display-referred sRGB: sample as SRGBColorSpace, output unlit, no tone mapping",
        },
        "nodes": {
            "static": "merged baked mesh (room, floor, window frame, radiator, lower legs, feet, server body); atlas",
            "desk_rig": {"note": "group; set position.y = deskHeight (translation y = 0.74 at preset 1); everything on the desk rides along",
                         "baseY": info["deskBase"]},
            "desk_baked": "merged baked mesh (top, upper legs, rails, tray, paddle + buttons, laptop, monitor + stand, keyboard, mouse, pad, gamepad, fan body + bracket); atlas. Clean desk: no charger, no cables",
            "screen_laptop": "flat 16:10 quad, runtime CanvasTexture + dock target; corners in manifest.screens.laptop",
            "screen_monitor": "curved strip (R 1.5 m), runtime CanvasTexture + dock target",
            "fan_blades": info["fan"],
            "kbd_accent": "the keyboard's accent caps (were lime); baked neutral, runtime tint (see `tint`)",
            "paddle_glyphs": "the paddle button legends 1 2 3 up down; baked neutral, runtime tint (see `tint`)",
            "tint": info["tint"],
            "cat_body": info["cat"], "cat_head": "pivot = neck (node origin)", "cat_tail": "pivot = tail base (node origin)",
            "ring": info["ring"], "ring_glow": info["ringGlow"],
            "leds": {"positions": info["leds"], "parent": info["ledsParent"],
                     "roles": {"led_paddle": "on while the desk moves", "led_kbd": "steady (the one green LED)",
                               "led_srv_0..5": "decorative pattern, change every 2-6 s"}},
            "fan_ring": info["fanRing"],
            "fan_display": info["fanDisplay"],
            "kbd_glow": info["kbdGlow"],
            "laptop_kbd_glow": info["laptopKbdGlow"],
            "hit_paddle": info["paddleHits"],
            "window_sky": {"window": info["window"], "fade": bake["windowFade"],
                           "note": "procedural sky; mix the sky towards the page bg by `fade` (the room around it is faded by that amount)"},
            "hit_laptop": "invisible tap target (set visible=false)", "hit_monitor": "invisible tap target (set visible=false)",
            "hit_paddle_1": "invisible tap target over paddle button 1 (see hit_paddle)",
            "hit_paddle_2": "invisible tap target over paddle button 2 (see hit_paddle)",
            "hit_paddle_3": "invisible tap target over paddle button 3 (see hit_paddle)",
            "hit_paddle_up": "invisible tap target over the paddle's up arrow (see hit_paddle)",
            "hit_paddle_down": "invisible tap target over the paddle's down arrow (see hit_paddle)",
            "geometry": "each named mesh node keeps its authored TRS; its geometry is in a child '<name>__geo' (quantisation transform lives there). Traverse for meshes.",
            "shadow_floor": {**info["shadowFloor"], "role": "shadow",
                             "note": "multiply decal, 1.5 mm above the floor under the desk, unparented. UV0 into the "
                                     "same atlas (day/night like the baked meshes); texels = the desk's floor shadow + "
                                     "contact occlusion at preset 1, stored for a DISPLAY-space multiply: runtime "
                                     "dst(display-encoded) * src(sampled linear) is correct as is; white = no change, "
                                     "exactly white at the border. The room (`static`) carries no desk shadow.",
                             "runtime": {"sunShiftPerMetre": [1.56, 0.0, -0.76],
                                         "day": "position = pos0 + sunShiftPerMetre * dh (glTF x/z; the sun shadow of "
                                                "a raised top slides along the sun's horizontal direction), scale 1, no fade",
                                         "night": "scale x/z = 1 + 0.35*dh about the node origin, uFade = 0 (pass 9: the "
                                                  "screens rise with the top, so the shadow under it widens but stays as "
                                                  "deep; uFade is shared with shadow_wall - fading it lightened both)",
                                         "mix": "blend the two by the theme mix (0 = day, 1 = night)",
                                         "dh": "deskHeight - 0.74 (>= 0)"}},
            "shadow_wall": {**info["shadowWall"], "role": "shadow",
                            "note": "multiply decal (display-space dst * src; white = no change), in front of the "
                                    "back wall, PARENTED to desk_rig so it rides up with the desk (a sun shadow on a vertical "
                                    "wall moves up by exactly dh). Stands 1.75 cm off the wall, in front of the skirting "
                                    "(covers it) and reaches 0.5 m below the floor (hidden at preset 1; raised, it is the "
                                    "leg shadow continued down). Carries the whole leg + top wall shadow. UV0 into the atlas; "
                                    "white at its left / right / top border"},
            "materials": "one unlit placeholder per role: baked, screen, ring, glow, led, sky, hit, shadow (multiply decal)",
        },
        "cameras": info["cameras"],
        "bounds": info["bounds"],
        "bake": {"samples": bake["samples"], "size": bake["size"], "exposure": bake["exposure"],
                 "fade": bake["fade"], "bg": {"day": T["semantic"]["light"]["bg"], "night": T["semantic"]["dark"]["bg"]}},
        "stats": {"tris": stats["tris"], "verts": stats["verts"], "bytes": {k: v for k, v in sizes.items()},
                  "quality": quality},
    }


if __name__ == "__main__":
    main()
