"""Export the node contract (spec §6.2) as a raw glb + the runtime metadata.

blender -b --factory-startup -P scene/export.py -- [--in desk_uv.blend] [--out desk-raw.glb]

One material (= one primitive, one draw call) per mesh node. Baked meshes keep
UV0 into the shared atlas; runtime meshes keep simple 0..1 UVs. scene/optimize.ts
then welds, quantises and meshopt-compresses; scene/finalize.py writes the manifest.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common as C  # noqa: E402
import dims as D  # noqa: E402

A = C.args()
BAKED = ["static", "desk_baked", "fan_blades", "cat_body", "cat_head", "cat_tail"]
PADDLE_HITS = [f"hit_paddle_{k}" for k in ("1", "2", "3", "up", "down")]   # left -> right
OVERLAYS = ["fan_ring", "fan_display", "kbd_glow", "laptop_kbd_glow"]
RUNTIME = ["screen_laptop", "screen_monitor", "ring", "ring_glow", "led_paddle", "led_kbd",
           *[f"led_srv_{i}" for i in range(6)], "window_sky", "hit_laptop", "hit_monitor",
           *OVERLAYS, *PADDLE_HITS]
CAMS = ["cam_wide", "cam_desk"]
EXPORT = ["desk_rig"] + BAKED + RUNTIME + CAMS
MATERIAL_OF = {**{n: "baked" for n in BAKED}, "screen_laptop": "screen", "screen_monitor": "screen",
               "ring": "ring", "ring_glow": "glow", "window_sky": "sky", "hit_laptop": "hit",
               "hit_monitor": "hit", **{n: "led" for n in RUNTIME if n.startswith("led_")},
               "fan_ring": "ring", "fan_display": "screen", "kbd_glow": "glow", "laptop_kbd_glow": "glow",
               **{n: "hit" for n in PADDLE_HITS}}


def g(v):
    return C.to_gltf(v)


def single_material(ob, name):
    """One material slot per mesh (= one primitive / draw call), named by role."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    me = ob.data
    for p in me.polygons:
        p.material_index = 0
    me.materials.clear()
    me.materials.append(m)


def local_verts(ob):
    return [v.co.copy() for v in ob.data.vertices]


def rig_local(ob, p_local):
    rig = bpy.data.objects["desk_rig"]
    return rig.matrix_world.inverted() @ (ob.matrix_world @ p_local)


def main():
    src = A.get("in", str(C.WORK / "desk_uv.blend"))
    out = Path(A.get("out", str(C.WORK / "desk-raw.glb")))
    bpy.ops.wm.open_mainfile(filepath=src)
    objs = bpy.data.objects
    missing = [n for n in EXPORT if n not in objs]
    assert not missing, f"missing nodes: {missing}"
    for n, mname in MATERIAL_OF.items():
        ob = objs[n]
        me = ob.data
        # strip build-time attributes, keep UV0 only
        for a in ("uvw", "room"):
            if a in me.attributes:
                me.attributes.remove(me.attributes[a])
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])
        single_material(ob, mname)
    for ob in objs:
        ob.select_set(ob.name in EXPORT)
    for n in ("ring_glow", "window_sky", "hit_laptop", "hit_monitor", *OVERLAYS, *PADDLE_HITS):
        objs[n].hide_render = False
    # camera aspect in the glb comes from the render size: posters are 16:10
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    bpy.context.view_layer.update()

    info = collect(objs)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", use_selection=True, export_yup=True,
        export_apply=True, export_extras=True, export_cameras=True, export_lights=False,
        export_materials="EXPORT", export_image_format="NONE", export_texcoords=True,
        export_normals=True, export_tangents=False, export_attributes=False,
        export_vertex_color="NONE", export_animations=False, export_skins=False, export_morph=False,
        export_gpu_instances=False, export_shared_accessors=False)
    (C.WORK / "export-info.json").write_text(json.dumps(info, indent=1))
    print("[export] wrote", out)


def collect(objs):
    rig = objs["desk_rig"]
    info: dict = {"deskBase": D.DESK_H, "presets": list(D.PRESETS), "range": list(D.RANGE), "step": D.STEP}
    # laptop screen: flat quad, node-local plane XY (normal +Z) in glTF
    sl = objs["screen_laptop"]
    vs = local_verts(sl)
    info["screenLaptop"] = {
        "w": D.LAPTOP["screen"][0], "h": D.LAPTOP["screen"][1],
        "cornersLocal": {k: g(v) for k, v in zip(("bl", "br", "tr", "tl"), vs)},
        "cornersRig": {k: g(rig_local(sl, v)) for k, v in zip(("bl", "br", "tr", "tl"), vs)},
        "normalLocal": [0, 0, 1],
    }
    sm = objs["screen_monitor"]
    Mo = D.MON
    r_s = Mo["radius"] - 0.0006
    half = Mo["screen"][0] / 2 / Mo["radius"]
    zc = D.DESK_H + Mo["screen_bottom"] + Mo["screen"][1] / 2
    corners = {}
    for k, (th, dz) in {"bl": (-half, -1), "br": (half, -1), "tr": (half, 1), "tl": (-half, 1)}.items():
        p = Vector((Mo["x"] + r_s * math.sin(th), Mo["front_y"] - Mo["radius"] + r_s * math.cos(th),
                    zc + dz * Mo["screen"][1] / 2))
        corners[k] = p
    inv = sm.matrix_world.inverted()
    info["screenMonitor"] = {
        "w": Mo["screen"][0], "h": Mo["screen"][1], "radius": round(r_s, 5), "arcRad": round(2 * half, 5),
        "curvatureCenterLocal": g(inv @ Vector((Mo["x"], Mo["front_y"] - Mo["radius"], zc))),
        "axisLocal": [0, 1, 0],
        "cornersLocal": {k: g(inv @ p) for k, p in corners.items()},
        "cornersRig": {k: g(rig.matrix_world.inverted() @ p) for k, p in corners.items()},
        "uv": "u runs along the arc (left->right); stored glTF v: 0 = top, 1 = bottom (standard)",
    }
    fb = objs["fan_blades"]
    info["fan"] = {"pivot": g(rig_local(fb, Vector())), "axisLocal": [0, 0, 1],
                   "note": "spin about the node's local +Z (glTF); pivot = hub = node origin"}
    ch, ct, cb = objs["cat_head"], objs["cat_tail"], objs["cat_body"]
    fwd = Vector(ch.get("forward", (1, 0, 0)))
    info["cat"] = {"hierarchy": "desk_rig > cat_body > (cat_head, cat_tail)",
                   "bodyOrigin": g(rig_local(cb, Vector())),
                   "neckPivot": g(rig_local(ch, Vector())), "tailPivot": g(rig_local(ct, Vector())),
                   "headForward": [round(x, 4) for x in g(fwd)],
                   "note": "parts have identity rotation; headForward is the gaze in rig space"}
    ring = objs["ring"]
    info["ring"] = {"center": g(rig_local(ring, Vector())), "radius": D.MON["ring_r"],
                    "tube": D.MON["ring_tube"], "facing": [0, 0, -1],
                    "default": "green", "note": "not baked; emissive tint at runtime"}
    glow = objs["ring_glow"]
    info["ringGlow"] = {"center": g(rig_local(glow, Vector())), "size": 0.9,
                        "note": "quad on the wall, parented to desk_rig; additive radial glow from UV"}
    info.update(collect_overlays(objs))
    info["leds"] = {n: g(objs[n].matrix_world.translation if not objs[n].parent
                         else rig_local(objs[n], Vector()))
                    for n in RUNTIME if n.startswith("led_")}
    info["ledsParent"] = {n: (objs[n].parent.name if objs[n].parent else None) for n in info["leds"]}
    cams = {}
    for n in CAMS:
        c = objs[n]
        tgt = Vector(c["target"])
        hf = math.radians(c["hfov"])
        asp = c["aspect"]
        vf = 2 * math.atan(math.tan(hf / 2) / asp)
        entry = {"parent": c.parent.name if c.parent else None, "hfovDeg": c["hfov"],
                 "yfovDeg": round(math.degrees(vf), 4), "aspect": asp,
                 "position": g(c.matrix_world.translation), "target": g(tgt)}
        if c.parent:
            entry["positionRig"] = g(rig_local(c, Vector()))
            entry["targetRig"] = g(rig.matrix_world.inverted() @ tgt)
        cams[n] = entry
    info["cameras"] = cams
    lo, hi = Vector((9, 9, 9)), Vector((-9, -9, -9))
    for n in ("static", "desk_baked"):
        ob = objs[n]
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    a, b = g(lo), g(hi)
    info["bounds"] = {"min": [min(a[i], b[i]) for i in range(3)], "max": [max(a[i], b[i]) for i in range(3)]}
    info["window"] = {"center": g(objs["window_sky"].matrix_world.translation), "w": D.WINDOW["w"],
                      "h": D.WINDOW["h"]}
    return info


def rig_dir(ob, d_local):
    """Blender local direction -> glTF direction in desk_rig space (unit, rounded)."""
    rig = bpy.data.objects["desk_rig"]
    d = (rig.matrix_world.inverted().to_3x3() @ ob.matrix_world.to_3x3() @ Vector(d_local)).normalized()
    return [round(x, 4) for x in g(d)]


def collect_overlays(objs):
    out = {}
    fr = objs["fan_ring"]
    out["fanRing"] = {"center": g(rig_local(fr, Vector())), "radius": round(D.FAN["r"] - 0.0052, 4),
                      "band": 0.0052, "depth": 0.0022, "axisLocal": [0, 0, 1],
                      "facing": rig_dir(fr, (0, -1, 0)),
                      "default": "green",
                      "note": "not baked; emissive band on the fan's front bezel, tint = the monitor ring's colour. "
                              "Node local +Z (glTF) = the fan's front normal; `facing` is that normal in desk_rig space"}
    fd = objs["fan_display"]
    vs = local_verts(fd)
    w, h = (round(abs(vs[1].x - vs[0].x), 4), round(abs(vs[2].z - vs[1].z), 4))
    out["fanDisplay"] = {"center": g(rig_local(fd, Vector())), "w": w, "h": h, "aspect": "2:1",
                         "cornersRig": {k: g(rig_local(fd, v)) for k, v in zip(("bl", "br", "tr", "tl"), vs)},
                         "normalLocal": [0, 0, 1], "facing": rig_dir(fd, (0, -1, 0)),
                         "uv": "TEXCOORD_0 standard glTF like the screens: stored (0,0) = top-left, (1,1) = "
                               "bottom-right of the readout -> CanvasTexture (256x128) with flipY=false",
                         "note": "not baked; flat quad 0.4 mm in front of the hub's round dark display disc, faces the viewer; "
                                 "runtime draws the fan speed (e.g. '100')"}
    for n, key in (("kbd_glow", "kbdGlow"), ("laptop_kbd_glow", "laptopKbdGlow")):
        ob = objs[n]
        vs = local_verts(ob)
        # per-key tiles in the node's local XY plane (Blender): overall extent
        xs_, ys_ = [v.x for v in vs], [v.y for v in vs]
        out[key] = {"center": g(rig_local(ob, Vector())),
                    "size": [round(max(xs_) - min(xs_), 4), round(max(ys_) - min(ys_), 4)],
                    "tiles": len(ob.data.polygons),
                    "normal": rig_dir(ob, (0, 0, 1)),
                    "note": "not baked; flat backlight: one rect per key slot (tiles the key block) under the key "
                            "tops, just above the plate / well, so it shows only between the caps; additive, tint = ring colour; "
                            "hidden from below by the case. UV 0..1 unused (flat)"}
    hits = {}
    for n in PADDLE_HITS:
        ob = objs[n]
        hits[n] = g(rig_local(ob, Vector()))
    out["paddleHits"] = {"centers": hits, "size": {"w": 0.016, "h": 0.016, "d": 0.015}, "order": PADDLE_HITS,
                         "parent": "desk_rig",
                         "note": "invisible tap targets over the paddle buttons 1, 2, 3, up, down (left to right; "
                                 "set visible=false, raycast only); box 1.6 wide x 1.6 tall x 1.5 cm deep, "
                                 "tilted with the paddle; origin = button centre"}
    return out


if __name__ == "__main__":
    main()
