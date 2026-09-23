"""UV-atlas + light bake for the day and night rigs (spec §6.1, plan Task 3).

blender -b --factory-startup -P scene/bake.py -- --in desk.blend --out desk_uv.blend
        [--size 4096] [--samples 512] [--reuse]   (--reuse: skip Cycles, recompose cached bakes)

Passes (all into one shared UV0 atlas):
  light-{day,night}  DIFFUSE direct+indirect (no colour), denoised with OIDN RTLightmap
  color              DIFFUSE colour (albedo incl. baked edge wear)
  pos / flag         EMIT of world position and (coverage, room) for the edge fade
atlas = fade(tonemap(color * light * exposure)); display-referred sRGB, unlit at runtime.
"""
from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import common as C  # noqa: E402

A = C.args()
SIZE = int(A.get("size", "4096"))
SAMPLES = int(A.get("samples", "512"))
CACHE = C.WORK / "bake"
POS_OFF, POS_SCALE = 4.0, 8.0

# per-rig exposure applied to linear radiance before tone mapping (tuned by eye)
EXPOSURE = {"day": 1.1, "night": 3.0}
BG = {"day": C.TOKENS["semantic"]["light"]["bg"], "night": C.TOKENS["semantic"]["dark"]["bg"]}
# edge fade: ellipsoidal distance from the desk (metres), smoothstep(F0, F1)
FADE = dict(center=(-0.25, -0.15, 0.95), axes=(2.0, 1.6, 1.3),
            f0={"day": 0.62, "night": 0.42}, f1={"day": 1.05, "night": 0.98})
WINDOW_CENTER = (-1.52, -0.40, 1.45)


def bake_objects():
    return [o for o in bpy.data.objects if o.type == "MESH" and o.get("bake")]


# ------------------------------------------------------------------ UVs

def unwrap(objs):
    for o in objs:
        me = o.data
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        me.uv_layers.new(name="UVMap")
        me.uv_layers.active_index = 0
        me.uv_layers[0].active_render = True
    ctx = bpy.context
    for o in ctx.view_layer.objects:
        o.select_set(o in objs)
    ctx.view_layer.objects.active = objs[0]
    ctx.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    # texel-density weighting (face attribute 'uvw' set in build.py)
    for o in objs:
        me = o.data
        w = np.ones(len(me.polygons), dtype=np.float32)
        if "uvw" in me.attributes:
            me.attributes["uvw"].data.foreach_get("value", w)
            w[w <= 0] = 1.0
        loop_face = np.empty(len(me.loops), dtype=np.int32)
        for p in me.polygons:
            loop_face[p.loop_start:p.loop_start + p.loop_total] = p.index
        uv = np.empty(len(me.loops) * 2, dtype=np.float32)
        me.uv_layers[0].data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2) * w[loop_face][:, None]
        me.uv_layers[0].data.foreach_set("uv", uv.ravel())
    pack()
    # sub-texel islands (3 mm lips, thin plates) would get no texels and inherit a
    # neighbour's colour: stretch every island to >= MIN_TEXELS (at 1024) across
    # its minor axis, then pack again
    grown = sum(widen_thin_islands(o) for o in objs)
    print(f"[bake] widened {grown} thin islands")
    pack()


MIN_TEXELS = 3.0 / 1024


def pack():
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, rotate_method="ANY", scale=True,
                            merge_overlap=False, margin_method="FRACTION", margin=0.0045,
                            shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


def widen_thin_islands(ob):
    import bmesh
    from bpy_extras import bmesh_utils
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    uvl = bm.loops.layers.uv.active
    n = 0
    for faces in bmesh_utils.bmesh_linked_uv_islands(bm, uvl):
        loops = [lp for f in faces for lp in f.loops]
        P = np.array([tuple(lp[uvl].uv) for lp in loops], dtype=np.float64)
        c = P.mean(axis=0)
        Q = P - c
        _, vecs = np.linalg.eigh(Q.T @ Q)
        changed = False
        for axis in (vecs[:, 0], vecs[:, 1]):
            proj = Q @ axis
            ext = float(proj.max() - proj.min())
            if ext < MIN_TEXELS:
                k = MIN_TEXELS / max(ext, MIN_TEXELS / 50)
                Q = Q + np.outer(proj * (k - 1.0), axis)
                changed = True
        if changed:
            n += 1
            for lp, q in zip(loops, Q + c):
                lp[uvl].uv = (float(q[0]), float(q[1]))
    bm.to_mesh(ob.data)
    bm.free()
    return n


# ------------------------------------------------------------------ bake helpers

def target_image(name):
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.new(name, SIZE, SIZE, alpha=False, float_buffer=True)
    return img


def point_nodes(objs, img):
    mats = {s.material for o in objs for s in o.material_slots if s.material}
    for m in mats:
        nt = m.node_tree
        node = nt.nodes.get("__bake")
        if node is None:
            node = nt.nodes.new("ShaderNodeTexImage")
            node.name = "__bake"
        node.image = img
        nt.nodes.active = node


def run_bake(objs, kind, passes, margin=8):
    ctx = bpy.context
    for o in ctx.view_layer.objects:
        o.select_set(o in objs)
    ctx.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type=kind, pass_filter=passes, margin=margin, margin_type="EXTEND",
                        use_clear=True, target="IMAGE_TEXTURES")


def pixels(img, ch=3):
    a = np.empty(SIZE * SIZE * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(SIZE, SIZE, 4)[:, :, :ch].copy()


def swap_materials(objs, mat):
    saved = {}
    for o in objs:
        saved[o.name] = [s.material for s in o.material_slots]
        for s in o.material_slots:
            s.material = mat
    return saved


def restore_materials(objs, saved):
    for o in objs:
        for s, m in zip(o.material_slots, saved[o.name]):
            s.material = m


def emit_mat(name, build):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(build(nt), em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def pos_socket(nt):
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    add = nt.nodes.new("ShaderNodeVectorMath")
    add.operation = "ADD"
    add.inputs[1].default_value = (POS_OFF, POS_OFF, POS_OFF)
    nt.links.new(geo.outputs["Position"], add.inputs[0])
    sc = nt.nodes.new("ShaderNodeVectorMath")
    sc.operation = "SCALE"
    sc.inputs["Scale"].default_value = 1.0 / POS_SCALE
    nt.links.new(add.outputs[0], sc.inputs[0])
    return sc.outputs[0]


def flag_socket(nt):
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_type = "GEOMETRY"
    at.attribute_name = "room"
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    comb.inputs["X"].default_value = 1.0
    nt.links.new(at.outputs["Fac"], comb.inputs["Y"])
    return comb.outputs[0]


# ------------------------------------------------------------------ image maths

def write_pfm(path, rgb):
    h, w, _ = rgb.shape
    with open(path, "wb") as f:
        f.write(f"PF\n{w} {h}\n-1.0\n".encode())
        f.write(np.ascontiguousarray(rgb, dtype="<f4").tobytes())


def read_pfm(path):
    with open(path, "rb") as f:
        assert f.readline().strip() == b"PF"
        w, h = map(int, f.readline().split())
        scale = float(f.readline())
        data = np.frombuffer(f.read(), dtype="<f4" if scale < 0 else ">f4")
    return data.reshape(h, w, 3).copy()


def dilate(img, valid, iters):
    """Grow island colours into empty texels (average of valid 4-neighbours)."""
    img = img.copy()
    valid = valid.copy()
    for _ in range(iters):
        acc = np.zeros_like(img)
        cnt = np.zeros(valid.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            v = np.roll(valid, (dy, dx), axis=(0, 1))
            acc += np.roll(img, (dy, dx), axis=(0, 1)) * v[..., None]
            cnt += v
        grow = (~valid) & (cnt > 0)
        if not grow.any():
            break
        img[grow] = acc[grow] / cnt[grow][:, None]
        valid = valid | grow
    return img


def neutral_tonemap(c):
    """Khronos PBR Neutral: keeps hue/saturation of the tokens' colours."""
    c = c.copy()
    x = c.min(axis=-1, keepdims=True)
    offset = np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    c -= offset
    peak = c.max(axis=-1, keepdims=True)
    start = 0.76
    d = 1.0 - start
    new_peak = 1.0 - d * d / (peak + d - start)
    comp = peak >= start
    scaled = c * np.where(comp, new_peak / np.maximum(peak, 1e-6), 1.0)
    g = 1.0 - 1.0 / (0.15 * (peak - new_peak) + 1.0)
    out = np.where(comp, scaled * (1 - g) + new_peak * g, c)
    return np.clip(out, 0.0, 1.0)


def srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def fade_mask(pos, room, rig):
    c = np.array(FADE["center"], dtype=np.float32)
    ax = np.array(FADE["axes"], dtype=np.float32)
    d = np.sqrt((((pos - c) / ax) ** 2).sum(axis=-1))
    return smoothstep(FADE["f0"][rig], FADE["f1"][rig], d) * room


def fade_at(p, rig):
    c, ax = np.array(FADE["center"]), np.array(FADE["axes"])
    d = float(np.sqrt((((np.array(p) - c) / ax) ** 2).sum()))
    t = min(max((d - FADE["f0"][rig]) / (FADE["f1"][rig] - FADE["f0"][rig]), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def compose(rig, light, color, pos, cov, room):
    lin = color * light * EXPOSURE[rig]
    disp = srgb(neutral_tonemap(lin))
    bg = np.array(C.hex_srgb(BG[rig]), dtype=np.float32)
    m = fade_mask(pos, room, rig)[..., None]
    out = disp * (1 - m) + bg * m
    return dilate(out, cov > 0.5, 48)


def save_png(path, rgb):
    """8-bit sRGB PNG via Blender (no colour management: values are display-referred)."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new(Path(path).stem, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = rgb
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


# ------------------------------------------------------------------ main

def main():
    src = A.get("in", str(C.WORK / "desk.blend"))
    out = A.get("out", str(C.WORK / "desk_uv.blend"))
    bpy.ops.wm.open_mainfile(filepath=src)
    CACHE.mkdir(parents=True, exist_ok=True)
    objs = bake_objects()
    print("[bake] objects:", [o.name for o in objs])
    unwrap(objs)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=False)
    print("[bake] saved", out)

    sc = bpy.context.scene
    dev = C.setup_gpu(sc)
    if A.get("device", "GPU").upper() == "CPU":
        sc.cycles.device = dev = "CPU"   # bit-exact reruns; GPU may flip ~1e-5 of bytes by 1 LSB
    sc.cycles.seed = 7
    sc.cycles.use_animated_seed = False
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 2
    sc.cycles.use_denoising = False
    print("[bake] device", dev, "size", SIZE, "samples", SAMPLES)

    names = ["color", "pos", "flag", "light-day", "light-night"]
    if "reuse" not in A or not all((CACHE / f"{n}.npy").exists() for n in names):
        img = target_image("bake_target")
        point_nodes(objs, img)
        sc.cycles.samples = 64
        run_bake(objs, "DIFFUSE", {"COLOR"})
        np.save(CACHE / "color.npy", pixels(img).astype(np.float16))
        pm = emit_mat("__pos", pos_socket)
        fm = emit_mat("__flag", flag_socket)
        for nm, mt, margin in (("pos", pm, 8), ("flag", fm, 0)):
            for m in (pm, fm):
                n = m.node_tree.nodes.get("__bake") or m.node_tree.nodes.new("ShaderNodeTexImage")
                n.name = "__bake"
                n.image = img
                m.node_tree.nodes.active = n
            saved = swap_materials(objs, mt)
            sc.cycles.samples = 4
            run_bake(objs, "EMIT", set(), margin=margin)
            restore_materials(objs, saved)
            np.save(CACHE / f"{nm}.npy", pixels(img).astype(np.float32 if nm == "pos" else np.float16))
        for rig in ("day", "night"):
            C.apply_rig(rig)
            sc.cycles.samples = SAMPLES
            run_bake(objs, "DIFFUSE", {"DIRECT", "INDIRECT"})
            raw = pixels(img)
            write_pfm(CACHE / f"light-{rig}.pfm", raw)
            subprocess.run(["oidnDenoise", "-d", "cpu", "-f", "RTLightmap", "--hdr",
                            str(CACHE / f"light-{rig}.pfm"), "-o", str(CACHE / f"light-{rig}-dn.pfm")],
                           check=True, stdout=subprocess.DEVNULL)
            np.save(CACHE / f"light-{rig}.npy", read_pfm(CACHE / f"light-{rig}-dn.pfm").astype(np.float16))
            print("[bake] baked", rig)

    color = np.load(CACHE / "color.npy").astype(np.float32)
    pos = np.load(CACHE / "pos.npy").astype(np.float32) * POS_SCALE - POS_OFF
    flag = np.load(CACHE / "flag.npy").astype(np.float32)
    cov, room = flag[..., 0], flag[..., 1]
    for rig in ("day", "night"):
        light = np.load(CACHE / f"light-{rig}.npy").astype(np.float32)
        light = dilate(light, cov > 0.5, 6)
        atlas = compose(rig, light, color, pos, cov, room)
        path = C.WORK / f"atlas-{rig}-{SIZE}.png"
        save_png(path, atlas)
        sel = cov > 0.5
        lum = (0.2126 * atlas[..., 0] + 0.7152 * atlas[..., 1] + 0.0722 * atlas[..., 2])[sel]
        print(f"[bake] {rig}: wrote {path}  lum p5={np.percentile(lum, 5):.3f} "
              f"p50={np.percentile(lum, 50):.3f} p95={np.percentile(lum, 95):.3f}")
    import json
    info = {"windowFade": {r: round(fade_at(WINDOW_CENTER, r), 3) for r in ("day", "night")}, "fade": FADE, "exposure": EXPOSURE,
            "size": SIZE, "samples": SAMPLES}
    (C.WORK / "bake-info.json").write_text(json.dumps(info, indent=1))
    print("[bake] info", info)


if __name__ == "__main__":
    main()
