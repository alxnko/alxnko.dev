"""Shared helpers for the headless Blender pipeline (scene/*.py).

Blender is Z-up; the glTF exporter converts to Y-up ((x, y, z) -> (x, z, -y)).
Everything here is deterministic: no wall-clock, no unseeded randomness.
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

SCENE_DIR = Path(__file__).resolve().parent
ROOT = SCENE_DIR.parent
WORK = Path(os.environ.get("ALXNKO_SCENE_WORK", "/var/tmp/alxnko-scene"))
PUBLIC = ROOT / "public" / "scene"
TOKENS = json.loads((ROOT / "design" / "tokens.json").read_text())
RGB = json.loads((ROOT / "design" / "rgb.json").read_text())   # `rgb` presets (R86)
PRIM = TOKENS["primitive"]
G = PRIM["graphite"]
SC = PRIM["scene"]


def args() -> dict[str, str]:
    """Parse `-- --key value` style args after Blender's own."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out: dict[str, str] = {}
    i = 0
    while i < len(argv):
        k = argv[i].lstrip("-")
        if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            out[k] = argv[i + 1]
            i += 2
        else:
            out[k] = "1"
            i += 1
    return out


# ---------------------------------------------------------------- colour

def srgb_to_lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h: str) -> tuple[float, float, float, float]:
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), 1.0)


def hex_srgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore


def mix_hex(a: str, b: str, t: float) -> str:
    ca, cb = hex_srgb(a), hex_srgb(b)
    return "#" + "".join(f"{round((x + (y - x) * t) * 255):02x}" for x, y in zip(ca, cb))


# ---------------------------------------------------------------- scene setup

def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    prefs = bpy.context.preferences
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "tmp").mkdir(exist_ok=True)
    prefs.filepaths.temporary_directory = str(WORK / "tmp")
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.render.engine = "CYCLES"


def setup_gpu(scene=None) -> str:
    """Enable OptiX, then CUDA, else CPU. Returns the device type used."""
    scene = scene or bpy.context.scene
    scene.render.engine = "CYCLES"
    try:
        cp = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        scene.cycles.device = "CPU"
        return "CPU"
    for kind in ("OPTIX", "CUDA"):
        try:
            cp.compute_device_type = kind
            cp.get_devices()
            devs = [d for d in cp.devices if d.type == kind]
            if devs:
                for d in cp.devices:
                    d.use = d.type == kind
                scene.cycles.device = "GPU"
                return kind
        except Exception:  # noqa: BLE001
            continue
    scene.cycles.device = "CPU"
    return "CPU"


def coll(name: str, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def link(obj, collection) -> None:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)


# ---------------------------------------------------------------- materials

_MATS: dict[str, bpy.types.Material] = {}


def _principled(m):
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return nt, bsdf, out


def mat(name: str, hex_color: str, rough: float = 0.6, metal: float = 0.0,
        emit: tuple[str, float] | None = None, edge: float = 0.0,
        edge_hex: str | None = None, bevel: float = 0.0015, noise: float = 0.0):
    """Principled material. `edge` lightens convex edges (AO 'inside' mask) toward
    `edge_hex` (baked 'wear'); `bevel` rounds shading normals (Bevel node);
    `noise` adds a tiny albedo variation so large flat areas do not look CG-flat."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:  # noqa: BLE001 (deprecated in 5.x, always on)
        pass
    nt, bsdf, _ = _principled(m)
    base = hex_lin(hex_color)
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    color_socket = bsdf.inputs["Base Color"]
    col_out = None
    if noise > 0:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 40.0
        nz.inputs["Detail"].default_value = 3.0
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["To Min"].default_value = 1.0 - noise
        mr.inputs["To Max"].default_value = 1.0 + noise
        nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        mul.inputs["A"].default_value = base
        nt.links.new(mr.outputs["Result"], mul.inputs["B"])
        col_out = mul.outputs["Result"]
    if edge > 0:
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao.inside = True
        ao.only_local = True
        ao.samples = 8
        ao.inputs["Distance"].default_value = 0.004
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.inputs["From Min"].default_value = 0.35
        ramp.inputs["From Max"].default_value = 0.9
        ramp.inputs["To Min"].default_value = edge
        ramp.inputs["To Max"].default_value = 0.0
        nt.links.new(ao.outputs["AO"], ramp.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        if col_out is not None:
            nt.links.new(col_out, mix.inputs["A"])
        else:
            mix.inputs["A"].default_value = base
        mix.inputs["B"].default_value = hex_lin(edge_hex or mix_hex(hex_color, "#ffffff", 0.35))
        nt.links.new(ramp.outputs["Result"], mix.inputs["Factor"])
        col_out = mix.outputs["Result"]
    if col_out is not None:
        nt.links.new(col_out, color_socket)
    if bevel > 0:
        bv = nt.nodes.new("ShaderNodeBevel")
        bv.samples = 8
        bv.inputs["Radius"].default_value = bevel
        nt.links.new(bv.outputs["Normal"], bsdf.inputs["Normal"])
    if emit:
        bsdf.inputs["Emission Color"].default_value = hex_lin(emit[0])
        bsdf.inputs["Emission Strength"].default_value = emit[1]
    m["base_hex"] = hex_color
    _MATS[name] = m
    return m


def emission_mat(name: str, hex_color: str, strength: float):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:  # noqa: BLE001
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = hex_lin(hex_color)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


# ---------------------------------------------------------------- geometry

def new_obj(name: str, bm: bmesh.types.BMesh, collection=None, mats=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    for m in mats or []:
        me.materials.append(m)
    return ob


def _xf(bm, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    m = Matrix.Translation(Vector(loc)) @ euler(rot)
    if scale is not None:
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def euler(rot) -> Matrix:
    from mathutils import Euler
    return Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()


def bm_box(size, bevel=0.0, segs=1, top_only=False, taper=1.0, drop_bottom=False):
    """Box centred on origin. `taper` scales the top face (keycaps).
    `drop_bottom` removes the -Z face (resting on something, never seen)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if taper != 1.0:
        for v in bm.verts:
            if v.co.z > 0:
                v.co.x *= taper
                v.co.y *= taper
    if bevel > 0:
        if top_only:
            edges = [e for e in bm.edges if all(v.co.z > 0 for v in e.verts)]
        else:
            edges = list(bm.edges)
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=segs, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    if drop_bottom:
        zmin = min(v.co.z for v in bm.verts)
        faces = [f for f in bm.faces if all(abs(v.co.z - zmin) < 1e-6 for v in f.verts)]
        bmesh.ops.delete(bm, geom=faces, context="FACES_ONLY")
    return bm


def box(name, size, loc, rot=(0, 0, 0), bevel=0.002, segs=1, mat_=None, coll_=None,
        taper=1.0, top_only=False, drop_bottom=False):
    bm = bm_box(size, bevel=bevel, segs=segs, top_only=top_only, taper=taper,
                drop_bottom=drop_bottom)
    _xf(bm, loc, rot)
    return new_obj(name, bm, coll_, [mat_] if mat_ else None)


def bm_cyl(r, depth, segs=24, r2=None, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs,
                          radius1=r, radius2=r if r2 is None else r2, depth=depth)
    return bm


def cyl(name, r, depth, loc, rot=(0, 0, 0), segs=24, mat_=None, coll_=None, r2=None,
        bevel=0.0, caps=True):
    bm = bm_cyl(r, depth, segs, r2, caps)
    if bevel > 0:
        rim = [e for e in bm.edges if len(e.link_faces) == 2 and
               abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=1, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    _xf(bm, loc, rot)
    return new_obj(name, bm, coll_, [mat_] if mat_ else None)


def torus(name, R, r, loc, rot=(0, 0, 0), major=48, minor=8, mat_=None, coll_=None):
    bm = bmesh.new()
    verts = []
    for i in range(major):
        a = 2 * math.pi * i / major
        ring = []
        for j in range(minor):
            b = 2 * math.pi * j / minor
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            ring.append(bm.verts.new((x, y, z)))
        verts.append(ring)
    for i in range(major):
        for j in range(minor):
            a, b = verts[i][j], verts[(i + 1) % major][j]
            c, d = verts[(i + 1) % major][(j + 1) % minor], verts[i][(j + 1) % minor]
            bm.faces.new((a, b, c, d))
    _xf(bm, loc, rot)
    return new_obj(name, bm, coll_, [mat_] if mat_ else None)


def catmull(points, samples=8):
    """Centripetal-ish Catmull-Rom through points (list of Vector)."""
    pts = [Vector(p) for p in points]
    ext = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


def sag(a, b, depth, n=16):
    """Hanging cable between a and b: parabola approximating a catenary."""
    a, b = Vector(a), Vector(b)
    return [a.lerp(b, i / n) - Vector((0, 0, 4 * depth * (i / n) * (1 - i / n))) for i in range(n + 1)]


def sweep(name, path, profile, mat_=None, coll_=None, caps=True, up=(0, 0, 1)):
    """Sweep a closed 2D profile [(x, y)...] along a polyline (parallel transport)."""
    path = [Vector(p) for p in path]
    bm = bmesh.new()
    rings = []
    n_prev = None
    for i, p in enumerate(path):
        if i == 0:
            t = (path[1] - path[0]).normalized()
        elif i == len(path) - 1:
            t = (path[-1] - path[-2]).normalized()
        else:
            t = ((path[i + 1] - path[i]).normalized() + (path[i] - path[i - 1]).normalized()).normalized()
        if n_prev is None:
            ref = Vector(up)
            if abs(ref.dot(t)) > 0.9:
                ref = Vector((1, 0, 0))
            n = (ref - t * ref.dot(t)).normalized()
        else:
            n = (n_prev - t * n_prev.dot(t)).normalized()
        n_prev = n
        bnorm = t.cross(n)
        rings.append([bm.verts.new(p + n * y + bnorm * x) for x, y in profile])
    k = len(profile)
    for i in range(len(rings) - 1):
        for j in range(k):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % k], rings[i + 1][(j + 1) % k], rings[i + 1][j]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm, coll_, [mat_] if mat_ else None)


def circle_profile(r, n=6):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def rect_profile(w, h):
    return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]


def cable(name, points, r=0.0018, mat_=None, coll_=None, samples=6, sides=6):
    return sweep(name, catmull(points, samples), circle_profile(r, sides), mat_, coll_)


def join(objs, name):
    objs = [o for o in objs if o is not None]
    ctx = bpy.context
    ctx.view_layer.update()
    for o in ctx.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    ctx.view_layer.objects.active = objs[0]
    with ctx.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs,
                           selected_editable_objects=objs):
        bpy.ops.object.join()
    ob = objs[0]
    ob.name = name
    ob.data.name = name
    ob.select_set(False)
    return ob


def swivel(x: float, y: float, yaw_deg: float) -> Matrix:
    """Rotation about the vertical axis through (x, y): + = counter-clockwise from above."""
    return (Matrix.Translation((x, y, 0.0)) @ Matrix.Rotation(math.radians(yaw_deg), 4, "Z")
            @ Matrix.Translation((-x, -y, 0.0)))


def set_origin(obj, world_point) -> None:
    """Move the object origin to world_point without moving geometry."""
    wp = Vector(world_point)
    mw = obj.matrix_world.copy()
    local = mw.inverted() @ wp
    obj.data.transform(Matrix.Translation(-local))
    obj.matrix_world = mw @ Matrix.Translation(local)


def parent_keep(child, parent) -> None:
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.matrix_world = mw


def text_mesh(name, body, size, loc, rot=(0, 0, 0), extrude=0.0003, mat_=None, coll_=None,
              align="CENTER"):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.resolution_u = 2
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.name = name
    ob = bpy.data.objects.new(name, me)
    (coll_ or bpy.context.scene.collection).objects.link(ob)
    ob.matrix_world = Matrix.Translation(Vector(loc)) @ euler(rot)
    if mat_:
        me.materials.append(mat_)
    return ob


def apply_xf(obj) -> None:
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)


def to_gltf(v) -> list[float]:
    """Blender Z-up vector -> glTF Y-up."""
    return [round(v[0], 5) + 0.0, round(v[2], 5) + 0.0, round(-v[1], 5) + 0.0]


# ---------------------------------------------------------------- lighting rigs

def kelvin(k: float) -> tuple[float, float, float]:
    """Approximate blackbody -> linear RGB (Tanner Helland fit, then linearised)."""
    t = k / 100.0
    r = 255 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    return tuple(srgb_to_lin(max(0, min(255, c)) / 255) for c in (r, g, b))  # type: ignore


RIG_SCREEN = {
    # rig -> (monitor strength, laptop strength) of the bake-time screen emitters
    "day": (0.35, 0.3),
    "night": (2.5, 1.5),
}


def apply_rig(name: str) -> None:
    """Switch world + light collection + screen emitter strength for a rig."""
    sc = bpy.context.scene
    sc.world = bpy.data.worlds["world_" + name]
    for r in ("day", "night"):
        c = bpy.data.collections.get("rig_" + r)
        if c:
            c.hide_render = r != name
            c.hide_viewport = r != name
    mon, lap = RIG_SCREEN[name]
    for obj_name, s in (("screen_monitor", mon), ("screen_laptop", lap)):
        ob = bpy.data.objects.get(obj_name)
        if ob and ob.active_material:
            nt = ob.active_material.node_tree
            for n in nt.nodes:
                if n.type == "EMISSION":
                    n.inputs["Strength"].default_value = s
    for ob in bpy.data.objects:
        if ob.name.startswith("led_") and ob.active_material:
            for n in ob.active_material.node_tree.nodes:
                if n.type == "EMISSION":
                    n.inputs["Strength"].default_value = 6.0 if name == "night" else 1.0


def no_stamp(sc) -> None:
    """No Date/RenderTime metadata in written images (keeps outputs byte-stable)."""
    for attr in dir(sc.render):
        if attr.startswith("use_stamp"):
            try:
                setattr(sc.render, attr, False)
            except (AttributeError, TypeError):
                pass


def render_settings(samples: int, w: int, h: int, denoise=True, scene=None) -> None:
    sc = scene or bpy.context.scene
    no_stamp(sc)
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.seed = 7
    sc.cycles.use_animated_seed = False
    sc.cycles.use_denoising = denoise
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:  # noqa: BLE001
        pass
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_depth = "8"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "None"
