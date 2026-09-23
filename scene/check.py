"""Re-import the shipped glb (decoded copy) and render it with the atlas, unlit.

blender -b --factory-startup -P scene/check.py -- --glb $WORK/desk-check.glb [--size 2048]

Proves the exported UV0 maps onto the atlas (no black islands, seams or bleeding)
and that node names / cameras survived export + meshopt + quantisation.
Writes $WORK/check-glb-{cam}-{rig}.png.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import common as C  # noqa: E402
import render_posters as RP  # noqa: E402

A = C.args()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=A.get("glb", str(C.WORK / "desk-check.glb")))
    objs = {}
    for ob in bpy.data.objects:
        name = ob.name.split("__geo")[0] if "__geo" in ob.name else ob.name
        if ob.type == "MESH" or name not in objs:
            objs[name] = ob
    need = ["static", "desk_baked", "screen_laptop", "screen_monitor", "ring", "ring_glow", "cam_desk", "cam_wide",
            "fan_ring", "fan_display", "kbd_glow", "laptop_kbd_glow", "hit_paddle_1", "hit_paddle_down"]
    missing = [n for n in need if n not in objs]
    assert not missing, f"missing after import: {missing}"
    size = A.get("size", "2048")
    for rig in ("night", "day"):
        RP.setup(rig, C.WORK / f"atlas-{rig}-{size}.png", objects=objs, window_fade=0.25)
        for cam in ("cam_desk", "cam_wide"):
            RP.render(objs[cam], 1200, 750, C.WORK / f"check-glb-{cam}-{rig}.png")


if __name__ == "__main__":
    main()
