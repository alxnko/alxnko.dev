"""UV-atlas + light bake for the day and night rigs (spec §6.1, plan Task 3).

blender -b --factory-startup -P scene/bake.py -- --in desk.blend --out desk_uv.blend
        [--size 4096] [--samples 512] [--reuse] [--draft]
  --reuse: skip Cycles, recompose cached bakes
  --draft: iteration defaults (2048 px, 128 samples) unless --size / --samples are given;
           commits always use the full 4096 / 512

Passes (all into one shared UV0 atlas):
  light-{day,night}  DIFFUSE direct+indirect (no colour), denoised with OIDN RTLightmap
  color              DIFFUSE colour (albedo incl. baked edge wear)
  pos / flag         EMIT of world position and (coverage, room, group) for the edge fade
atlas = fade(tonemap(color * light * exposure)); display-referred sRGB, unlit at runtime.

Movable desk: the rig (everything under desk_rig) is baked with the full scene, the room
(`static`) with the rig invisible to every ray except its screens (their light stays), so the
room carries no rig shadows. The two shadow decals (`shadow_floor`, `shadow_wall`) are baked
both ways; their atlas texels hold the ratio lit-with-rig / lit-without-rig, sRGB-encoded,
softened and faded to exactly white at the quad border: a runtime multiply decal.
"""
from __future__ import annotations

import math
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import common as C  # noqa: E402

A = C.args()
DRAFT = "draft" in A
SIZE = int(A.get("size", "2048" if DRAFT else "4096"))
SAMPLES = int(A.get("samples", "128" if DRAFT else "512"))
CACHE = C.WORK / "bake"
POS_OFF, POS_SCALE = 4.0, 8.0

# per-rig exposure applied to linear radiance before tone mapping (tuned by eye)
EXPOSURE = {"day": 1.1, "night": 3.0}
AO_SAMPLES, AO_DIST, AO_K = 128, 0.10, 0.6     # contact-occlusion pass: samples, reach (m), strength
BG = {"day": C.TOKENS["semantic"]["light"]["bg"], "night": C.TOKENS["semantic"]["dark"]["bg"]}
# edge fade: ellipsoidal distance from the desk (metres), smoothstep(F0, F1)
FADE = dict(center=(-0.25, -0.15, 0.95), axes=(2.0, 1.6, 1.3),
            f0={"day": 0.62, "night": 0.42}, f1={"day": 1.05, "night": 0.98})
WINDOW_CENTER = (-1.52, -0.40, 1.45)


def bake_objects():
    return [o for o in bpy.data.objects if o.type == "MESH" and o.get("bake")]


def under_rig(o):
    p = o
    while p is not None:
        if p.name == "desk_rig":
            return True
        p = p.parent
    return False


# group codes in the flag pass (blue channel): room, shadow decals (floor, wall), rig
GRP = {"static": 0.0, "floor": 0.5, "wall": 0.75, "rig": 1.0}


MOVING = ("fan_blades", "cat_head", "cat_tail")   # animated at runtime: must not cast baked shadows
GRP_BLADES = 0.9


def group_of(o):
    if o.name == "fan_blades":
        return GRP_BLADES
    if o.get("shadow_decal"):
        return float(o["shadow_decal"])
    return GRP["rig"] if under_rig(o) else GRP["static"]


def set_group_attr(objs):
    for o in objs:
        me = o.data
        a = me.attributes.get("grp") or me.attributes.new("grp", "FLOAT", "FACE")
        a.data.foreach_set("value", [group_of(o)] * len(me.polygons))


RAYS = ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow")


def moving_no_cast():
    """The fan blades spin, the cat's head / tail turn: bake them lit, but invisible to shadow
    and bounce rays, so nothing static carries a shadow that belongs to a moving part."""
    saved = {}
    for n in MOVING:
        o = bpy.data.objects.get(n)
        if o is None:
            continue
        saved[n] = [getattr(o, a) for a in RAYS]
        for a in RAYS:
            setattr(o, a, False)
    return saved


def restore_moving(saved):
    for n, vals in saved.items():
        for a, v in zip(RAYS, vals):
            setattr(bpy.data.objects[n], a, v)


def nrm_socket(nt):
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mul = nt.nodes.new("ShaderNodeVectorMath")
    mul.operation = "MULTIPLY_ADD"
    mul.inputs[1].default_value = (0.5, 0.5, 0.5)
    mul.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs["Normal"], mul.inputs[0])
    return mul.outputs[0]


def radial_average(light, pos, nrm, sel, hub, axis, step=0.0015):
    """Rotation-invariant blade lighting: every blade texel gets the mean light of all blade
    texels at the same radius from the hub and the same facing (front / back / rim)."""
    idx = np.nonzero(sel)
    p = pos[idx] - hub
    along = p @ axis
    rad = np.linalg.norm(p - np.outer(along, axis), axis=1)
    f = nrm[idx] @ axis
    face = np.where(f > 0.5, 2, np.where(f < -0.5, 0, 1))
    key = np.floor(rad / step).astype(np.int64) * 3 + face
    out = light.copy()
    for c in range(light.shape[-1]):
        v = light[idx][:, c]
        sums = np.bincount(key, weights=v)
        cnts = np.bincount(key)
        out[idx[0], idx[1], c] = sums[key] / np.maximum(cnts[key], 1)
    return out


def hide_rig_from_rays():
    """Room pass: every rig object stops occluding / bouncing. The screens keep emitting,
    front side only (their lid / housing would block the back side; with the rig hidden
    a two-sided screen would light the wall behind it)."""
    saved = {"rays": {}, "one_sided": []}
    for o in bpy.data.objects:
        if o.type != "MESH" or not under_rig(o):
            continue
        if o.name.startswith("screen_"):
            for sl in o.material_slots:
                m = sl.material
                if m and m.name not in [x[0] for x in saved["one_sided"]]:
                    saved["one_sided"].append(one_sided(m))
            continue
        saved["rays"][o.name] = [getattr(o, a) for a in RAYS]
        for a in RAYS:
            setattr(o, a, False)
    return saved


def one_sided(m):
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output)
    link = out.inputs["Surface"].links[0]
    src = link.from_socket
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(src, mix.inputs[1])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return (m.name, src, [geo, tr, mix], out)


def restore_rays(saved):
    if not saved:
        return
    for n, vals in saved["rays"].items():
        for a, v in zip(RAYS, vals):
            setattr(bpy.data.objects[n], a, v)
    for name, src, nodes, out in saved["one_sided"]:
        nt = bpy.data.materials[name].node_tree
        nt.links.new(src, out.inputs["Surface"])
        for n in nodes:
            nt.nodes.remove(n)


# ------------------------------------------------------------------ UVs

def read_fixed_uvs(o):
    """(face mask, per-loop uv) of faces laid out by build.py (`fixuv` / `uvfix`), or None."""
    me = o.data
    if "fixuv" not in me.attributes or "uvfix" not in me.attributes:
        return None
    fx = np.zeros(len(me.polygons), dtype=np.float32)
    me.attributes["fixuv"].data.foreach_get("value", fx)
    uv = np.zeros(len(me.loops) * 2, dtype=np.float32)
    me.attributes["uvfix"].data.foreach_get("vector", uv)
    return fx > 0.5, uv.reshape(-1, 2)


def apply_fixed_uvs(o, fixed):
    """Replace the smart-project UVs of the fixed faces by their continuous layout, scaled
    to the same texel density the per-face weights give everything else."""
    mask, fuv = fixed
    me = o.data
    uv = np.empty(len(me.loops) * 2, dtype=np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    w = np.ones(len(me.polygons), dtype=np.float32)
    if "uvw" in me.attributes:
        me.attributes["uvw"].data.foreach_get("value", w)
    ratios = []
    for p in me.polygons:
        if mask[p.index] or p.area < 1e-6:
            continue
        li = list(p.loop_indices)
        q = uv[li]
        a = 0.5 * abs(sum(q[k][0] * q[(k + 1) % len(q)][1] - q[(k + 1) % len(q)][0] * q[k][1] for k in range(len(q))))
        if a > 0:
            ratios.append(math.sqrt(a / p.area) / max(w[p.index], 1e-3))
    r = float(np.median(ratios)) if ratios else 1.0
    for p in me.polygons:
        if mask[p.index]:
            for li in p.loop_indices:
                uv[li] = fuv[li] * r
    me.uv_layers[0].data.foreach_set("uv", uv.ravel())
    return r


def unwrap(objs):
    fixed = {o.name: read_fixed_uvs(o) for o in objs}
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
    for o in objs:
        if fixed[o.name] is not None:
            r = apply_fixed_uvs(o, fixed[o.name])
            print(f"[bake] {o.name}: {int(fixed[o.name][0].sum())} faces on continuous islands (scale {r:.4f})")
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


def run_bake(objs, kind, passes, margin=8, strip=None, local=True):
    """Bake `objs` into the shared target. Blender bakes a multi-object selection one object
    at a time, re-syncing the whole scene for each (the GPU idles most of the time), so the
    targets are first merged into world-space proxies, one per ray-visibility signature
    (same geometry, materials, UVs and attributes: the result is the same bake), and
    each proxy is baked once. Proxies with different signatures share the image
    (use_clear only on the first). `local`: the materials use per-object shading (Bevel
    normals, the edge-wear AO with only_local): objects closer than LOCAL_GAP stay in separate
    proxies so those see exactly what they saw before. The EMIT passes pass local=False."""
    t0 = time.perf_counter()
    proxies, hidden = make_proxies(objs, strip, local)
    ctx = bpy.context
    try:
        for i, px in enumerate(proxies):
            for o in ctx.view_layer.objects:
                o.select_set(o is px)
            ctx.view_layer.objects.active = px
            bpy.ops.object.bake(type=kind, pass_filter=passes, margin=margin, margin_type="EXTEND",
                                use_clear=i == 0, target="IMAGE_TEXTURES")
    finally:
        drop_proxies(proxies, hidden)
    TIMES.append((kind, len(objs), len(proxies), time.perf_counter() - t0))
    print(f"[bake] {kind:7s} {len(objs)} objects in {len(proxies)} calls: {TIMES[-1][-1]:.1f} s")


TIMES = []


def ray_sig(o):
    return tuple(bool(getattr(o, a)) for a in RAYS)


LOCAL_GAP = 0.01


def world_box(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return (np.min(pts, axis=0) - LOCAL_GAP, np.max(pts, axis=0) + LOCAL_GAP)


def near(a, b):
    return bool(np.all(a[0] <= b[1]) and np.all(b[0] <= a[1]))


def local_shading(o):
    """True if a material of `o` looks at its own object only (Bevel, AO)."""
    return any(n.type in ("BEVEL", "AMBIENT_OCCLUSION") for s in o.material_slots if s.material
               for n in s.material.node_tree.nodes)


def make_proxies(objs, strip=None, local=True):
    """World-space joined copies of `objs`, one per ray-visibility signature. `strip`: a face
    attribute; faces where it is set are left out (neither baked nor occluding)."""
    ctx = bpy.context
    ctx.view_layer.update()
    dg = ctx.evaluated_depsgraph_get()
    groups = {}
    for o in objs:
        bins = groups.setdefault(ray_sig(o), [])
        box = world_box(o)
        for b in bins:
            if not local or not any((local_shading(o) or local_shading(q)) and near(box, bx)
                                    for q, bx in zip(b[0], b[1])):
                b[0].append(o)
                b[1].append(box)
                break
        else:
            bins.append(([o], [box]))
    proxies, hidden = [], []
    for sig, members in ((sig, b[0]) for sig, bins in groups.items() for b in bins):
        if len(members) == 1 and not (strip and strip in members[0].data.attributes):
            proxies.append(members[0])      # alone: bake the object itself
            continue
        parts = []
        for o in members:
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
            assert [m.name for m in me.materials] == [s.material.name for s in o.material_slots], o.name
            me.transform(o.matrix_world)
            if o.matrix_world.determinant() < 0:
                me.flip_normals()
            if strip and strip in me.attributes:
                strip_faces(me, strip)
            p = bpy.data.objects.new("__px_" + o.name, me)
            ctx.scene.collection.objects.link(p)
            parts.append(p)
        px = parts[0] if len(parts) == 1 else C.join(parts, f"__px{len(proxies)}")
        for a, v in zip(RAYS, sig):
            setattr(px, a, v)
        px["__proxy"] = True
        proxies.append(px)
        hidden += [o for o in members if not o.hide_render]
    for o in hidden:
        o.hide_render = True
    return proxies, hidden


def strip_faces(me, attr):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    lay = bm.faces.layers.float.get(attr)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[lay] > 0.5], context="FACES")
    bm.to_mesh(me)
    bm.free()


def drop_proxies(proxies, hidden):
    for px in proxies:
        if not px.get("__proxy"):
            continue
        me = px.data
        bpy.data.objects.remove(px)
        bpy.data.meshes.remove(me)
    for o in hidden:
        o.hide_render = False


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
    gp = nt.nodes.new("ShaderNodeAttribute")
    gp.attribute_type = "GEOMETRY"
    gp.attribute_name = "grp"
    nt.links.new(gp.outputs["Fac"], comb.inputs["Z"])
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


def compose(rig, light, color, pos, cov, room, decal=None):
    lin = color * light * EXPOSURE[rig]
    disp = srgb(neutral_tonemap(lin))
    bg = np.array(C.hex_srgb(BG[rig]), dtype=np.float32)
    m = fade_mask(pos, room, rig)[..., None]
    out = disp * (1 - m) + bg * m
    if decal is not None:
        sel, val = decal
        out[sel] = val[sel][:, None]
    return dilate(out, cov > 0.5, 48)


# shadow decals: darkening strength (1 = the full rig shadow: at preset 1 room * decal must
# equal the full-scene bake) and the width (m) of the fade to white on the borders that fade
DECAL_STRENGTH = 1.0
DECAL_RAMP = 0.15
EXT_Z = 0.004           # wall decal texels below this (under the floor) repeat the row above


def box_blur(img, valid, r):
    """Blur `img` over the valid texels only (separable box, radius r texels)."""
    v = valid.astype(np.float32)
    a, w = img * v, v
    for axis in (0, 1):
        a = sum(np.roll(a, k, axis=axis) for k in range(-r, r + 1))
        w = sum(np.roll(w, k, axis=axis) for k in range(-r, r + 1))
    return np.where(valid, a / np.maximum(w, 1e-6), img)


def extend_down(r, pos, sel, z_src=(0.006, 0.03), step=0.004):
    """Wall decal texels under the floor (hidden at preset 1): repeat, per x, the ratio just
    above the floor. A raised desk moves its wall shadow up by dh; this is what slides into view
    below it - the leg shadow continued straight down (a vertical column casts a vertical strip)."""
    x = pos[..., 0]
    z = pos[..., 2]
    src = sel & (z >= z_src[0]) & (z < z_src[1])
    dst = sel & (z < EXT_Z)
    if not src.any() or not dst.any():
        return r
    x0 = float(x[sel].min())
    nb = int((float(x[sel].max()) - x0) / step) + 2
    bs = ((x[src] - x0) / step).astype(np.int64)
    sums = np.bincount(bs, weights=r[src], minlength=nb)
    cnts = np.bincount(bs, minlength=nb)
    have = cnts > 0
    prof = np.interp(np.arange(nb), np.nonzero(have)[0], sums[have] / cnts[have])
    out = r.copy()
    out[dst] = prof[np.clip(((x[dst] - x0) / step).astype(np.int64), 0, nb - 1)]
    return out


def decal_values(rig, lw, lwo, lwall, pos, grp, decals):
    """Per texel of the decal islands: sRGB-encoded linear ratio lit-with / lit-without. The
    floor decal divides by the room light (the static inner columns' floor shadow stays in the
    room), the wall decal by the room light without those columns: the whole leg's wall shadow
    is in the wall decal, continuous with the top's, and rises with it."""
    y_with = lw.mean(axis=-1)
    out = np.ones(y_with.shape, dtype=np.float32)
    sel_all = np.zeros(y_with.shape, dtype=bool)
    fade = 1.0 - fade_mask(pos, np.ones_like(y_with), rig)
    for code, (axes, (a0, a1, b0, b1), flags) in decals.items():
        sel = np.abs(grp - code) < 0.06
        den = (lwall if axes == "xz" else lwo).mean(axis=-1)
        # near-black texels (in the corners at night, inside the conduit) would give a noisy
        # ratio of two tiny numbers: a small offset keeps them ~1 (their darkening is invisible)
        eps = 0.03 * float(np.median(den[sel & (pos[..., 2] > 0.0)]))
        r = np.clip((y_with + eps) / (den + eps), 0.0, 1.0)
        ia, ib = (0, 1) if axes == "xy" else (0, 2)
        if axes == "xz":
            r = extend_down(r, pos, sel)
        pa, pb = pos[..., ia], pos[..., ib]
        dist = np.full(r.shape, np.inf, dtype=np.float32)
        for on, d in zip(flags, (pa - a0, a1 - pa, pb - b0, b1 - pb)):
            if on:
                dist = np.minimum(dist, d)
        ramp = smoothstep(0.0, DECAL_RAMP, dist)
        rr = box_blur(r, sel, 3)
        dark = (1.0 - rr) * DECAL_STRENGTH * ramp * fade
        # a fade must only happen where the desk casts (almost) nothing: report the worst case
        lost = ((1.0 - rr) * fade * (1.0 - ramp))[sel]
        print(f"[bake] {rig} decal {axes}: max darkening lost to the border fade {float(lost.max()):.3f}")
        out = np.where(sel, 1.0 - dark, out)
        sel_all |= sel
    # runtime: display-encoded frame * linear(texel) -> store ratio^(1/2.2), so the display-space
    # multiply equals the physically right linear one (and the posters, which emulate it)
    return sel_all, srgb(np.power(np.clip(out, 0.0, 1.0), 1.0 / 2.2))


def save_png(path, rgb):
    """8-bit sRGB PNG via Blender (no colour management: values are display-referred)."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new(Path(path).stem, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    rgba = np.ones((h, w, 4), dtype=np.float32)
    # triangular dither (+-1 LSB, fixed seed) before the 8-bit quantisation: no banding in
    # the dark, slow night gradients on walls and floor
    rng = np.random.default_rng(7)
    tri = (rng.random((h, w, 1), dtype=np.float32) - rng.random((h, w, 1), dtype=np.float32)) / 255.0
    rgba[..., :3] = np.clip(rgb + tri, 0.0, 1.0)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


OIDN_DEVICE = A.get("oidn", "cuda")


def denoise(stem, device=None):
    """OIDN RTLightmap on the GPU (CUDA) when available, else the CPU. Asynchronous."""
    device = device or OIDN_DEVICE
    cmd = ["oidnDenoise", "-d", device, "-f", "RTLightmap", "--hdr", str(CACHE / f"{stem}.pfm"),
           "-o", str(CACHE / f"{stem}-dn.pfm")]
    return device, subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def finish_denoise(stem, job):
    device, proc = job
    _, err = proc.communicate()
    if proc.returncode != 0:
        if device == "cpu":
            raise RuntimeError(f"oidnDenoise failed for {stem}: {err.decode()[-400:]}")
        print(f"[bake] oidn {device} failed for {stem}, falling back to cpu")
        return finish_denoise(stem, denoise(stem, "cpu"))
    np.save(CACHE / f"{stem}.npy", read_pfm(CACHE / f"{stem}-dn.pfm").astype(np.float16))


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
    for w in bpy.data.worlds:
        w.light_settings.distance = AO_DIST
    sc.cycles.use_animated_seed = False
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 2
    sc.cycles.use_denoising = False
    print("[bake] device", dev, "size", SIZE, "samples", SAMPLES)

    set_group_attr(objs)
    rig_objs = [o for o in objs if group_of(o) in (GRP["rig"], GRP_BLADES)]
    room_objs = [o for o in objs if group_of(o) == GRP["static"]]
    decals = [o for o in objs if o.get("shadow_decal")]
    # with: everything; room: the rig hidden from rays (the room's own light); wall: the room
    # also without the static inner columns (`legcol`) - the light the back wall gets when the
    # whole leg shadow comes from the wall decal (see decal_values)
    passes = {"with": rig_objs + decals, "room": room_objs + decals, "wall": room_objs + decals}
    names = ["color", "pos", "flag", "nrm", "ao-with", "ao-room"] + [f"light-{r}-{p}" for r in ("day", "night") for p in passes]
    if "reuse" not in A or not all((CACHE / f"{n}.npy").exists() for n in names):
        t_bake = time.perf_counter()
        jobs = []
        img = target_image("bake_target")
        point_nodes(objs, img)
        sc.cycles.samples = 64
        run_bake(objs, "DIFFUSE", {"COLOR"})
        np.save(CACHE / "color.npy", pixels(img).astype(np.float16))
        pm = emit_mat("__pos", pos_socket)
        fm = emit_mat("__flag", flag_socket)
        nm_ = emit_mat("__nrm", nrm_socket)
        for nm, mt, margin in (("pos", pm, 8), ("flag", fm, 0), ("nrm", nm_, 8)):   # geometry only
            for m in (pm, fm, nm_):
                n = m.node_tree.nodes.get("__bake") or m.node_tree.nodes.new("ShaderNodeTexImage")
                n.name = "__bake"
                n.image = img
                m.node_tree.nodes.active = n
            saved = swap_materials(objs, mt)
            sc.cycles.samples = 4
            run_bake(objs, "EMIT", set(), margin=margin, local=nm == "nrm")
            restore_materials(objs, saved)
            np.save(CACHE / f"{nm}.npy", pixels(img).astype(np.float32 if nm in ("pos", "nrm") else np.float16))
        for rig in ("day", "night"):
            C.apply_rig(rig)
            sc.cycles.samples = SAMPLES
            for pname, targets in passes.items():
                saved = hide_rig_from_rays() if pname != "with" else {}
                mv = moving_no_cast()
                if rig == "day" and pname != "wall":
                    # contact occlusion (crisp near contact, 12 cm reach), same visibility as the light
                    sc.cycles.samples = AO_SAMPLES
                    run_bake(targets, "AO", set())
                    np.save(CACHE / f"ao-{pname}.npy", pixels(img)[..., :1].astype(np.float16))
                    sc.cycles.samples = SAMPLES
                run_bake(targets, "DIFFUSE", {"DIRECT", "INDIRECT"}, strip="legcol" if pname == "wall" else None)
                restore_moving(mv)
                restore_rays(saved)
                raw = pixels(img)
                stem = f"light-{rig}-{pname}"
                write_pfm(CACHE / f"{stem}.pfm", raw)
                jobs.append((stem, denoise(stem)))   # runs while the next pass bakes
            print("[bake] baked", rig)
        for stem, job in jobs:
            finish_denoise(stem, job)
        print(f"[bake] cycles+denoise {time.perf_counter() - t_bake:.1f} s "
              f"(bake calls {sum(t[-1] for t in TIMES):.1f} s)")

    color = np.load(CACHE / "color.npy").astype(np.float32)
    pos = np.load(CACHE / "pos.npy").astype(np.float32) * POS_SCALE - POS_OFF
    flag = np.load(CACHE / "flag.npy").astype(np.float32)
    cov, room, grp = flag[..., 0], flag[..., 1], flag[..., 2]
    nrm = np.load(CACHE / "nrm.npy").astype(np.float32) * 2.0 - 1.0
    dinfo = {float(o["shadow_decal"]): (o["decal_axes"], tuple(o["decal_rect"]), tuple(o["decal_ramp"]))
             for o in decals}
    is_room = (cov > 0.5) & (grp < 0.25)
    # room texels the wall decal covers: behind its plane (back wall, skirting, socket), inside it
    wd = next(o for o in decals if o["decal_axes"] == "xz")
    wx0, wx1, _, wz1 = wd["decal_rect"]
    wall_zone = is_room & (pos[..., 1] > wd.matrix_world.translation.y - 0.001) & \
        (pos[..., 0] > wx0) & (pos[..., 0] < wx1) & (pos[..., 2] < wz1)
    blades = [o for o in objs if o.name == "fan_blades"]
    for rig in ("day", "night"):
        lw = np.load(CACHE / f"light-{rig}-with.npy").astype(np.float32)
        lwo = np.load(CACHE / f"light-{rig}-room.npy").astype(np.float32)
        # contact occlusion on top of the path-traced light: crisp dark contact where things
        # meet (feet on the floor, keyboard / pad / mouse on the desk, the plate under the stand)
        aw = np.load(CACHE / "ao-with.npy").astype(np.float32)
        ar = np.load(CACHE / "ao-room.npy").astype(np.float32)
        lw = lw * (1.0 - AO_K * (1.0 - np.clip(aw, 0, 1)))
        lwo = lwo * (1.0 - AO_K * (1.0 - np.clip(ar, 0, 1)))
        lwall = np.load(CACHE / f"light-{rig}-wall.npy").astype(np.float32) * (1.0 - AO_K * (1.0 - np.clip(ar, 0, 1)))
        light = np.where(is_room[..., None], np.where(wall_zone[..., None], lwall, lwo), lw)
        for b in blades:
            M = b.matrix_world
            sel_b = (cov > 0.5) & (np.abs(grp - GRP_BLADES) < 0.03)
            light = radial_average(light, pos, nrm, sel_b, np.array(M.translation),
                                   np.array((M.to_3x3() @ Vector((0, 1, 0))).normalized()))
        light = dilate(light, cov > 0.5, 6)
        dsel, dval = decal_values(rig, lw, lwo, lwall, pos, grp, dinfo)
        dsel &= cov > 0.5
        atlas = compose(rig, light, color, pos, cov, room, decal=(dsel, dval))
        path = C.WORK / f"atlas-{rig}-{SIZE}.png"
        save_png(path, atlas)
        sel = cov > 0.5
        lum = (0.2126 * atlas[..., 0] + 0.7152 * atlas[..., 1] + 0.0722 * atlas[..., 2])[sel]
        print(f"[bake] {rig}: wrote {path}  lum p5={np.percentile(lum, 5):.3f} "
              f"p50={np.percentile(lum, 50):.3f} p95={np.percentile(lum, 95):.3f}  "
              f"decal min={float(dval[dsel].min()):.3f} texels={int(dsel.sum())}")
    import json
    info = {"windowFade": {r: round(fade_at(WINDOW_CENTER, r), 3) for r in ("day", "night")}, "fade": FADE, "exposure": EXPOSURE,
            "size": SIZE, "samples": SAMPLES}
    (C.WORK / "bake-info.json").write_text(json.dumps(info, indent=1))
    print("[bake] info", info)


if __name__ == "__main__":
    main()
