"""Procedurally model the owner's desk (spec §6.1, §6.2, §10).

blender -b --factory-startup -P scene/build.py -- --out /var/tmp/alxnko-scene/desk.blend [--preview]

Node names follow the spec §6.2 contract exactly. Geometry is stylised-real:
chamfered boxes, shading bevels (Bevel node), baked edge wear (AO 'inside').
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common as C  # noqa: E402
import dims as D  # noqa: E402

RNG = random.Random(20260923)
R = math.radians

# ------------------------------------------------------------------ palette
LAMINATE = C.SC["laminate"]
STEEL = C.SC["steel"]
WALL = C.SC["wall"]
FLOOR = C.SC["floor"]
PAD = C.SC["pad"]
KEY_DARK = C.SC["keyDark"]
KEY_GREY = C.SC["keyGrey"]
KEY_LIME = C.SC["keyLime"]
STAND_GREY = C.SC["monitorStand"]
GREEN = C.PRIM["green"]

PARTS_STATIC: list = []
PARTS_RIG: list = []


def tag(ob, weight=1.0, room=False):
    """Per-face atlas weight (texel density) and room flag (edge fade)."""
    me = ob.data
    for nm, val in (("uvw", float(weight)), ("room", 1.0 if room else 0.0)):
        a = me.attributes.get(nm) or me.attributes.new(nm, "FLOAT", "FACE")
        a.data.foreach_set("value", [val] * len(me.polygons))
    return ob


def S(ob, weight=1.0, room=False):
    PARTS_STATIC.append(tag(ob, weight, room))
    return ob


def Rg(ob, weight=1.0):
    PARTS_RIG.append(tag(ob, weight))
    return ob


def xform(ob, M):
    ob.matrix_world = M @ ob.matrix_world
    return ob


def M_at(loc, yaw=0.0, pitch=0.0, roll=0.0):
    return Matrix.Translation(Vector(loc)) @ C.euler((pitch, roll, yaw))


# ------------------------------------------------------------------ materials

def build_materials():
    m = {}
    m["laminate"] = C.mat("laminate", LAMINATE, edge=0.10, edge_hex=C.mix_hex(LAMINATE, "#8f8a7e", 0.6),
                          bevel=0.0025, noise=0.015)
    m["laminate_edge"] = C.mat("laminate_edge", C.mix_hex(LAMINATE, "#b9b3a4", 0.55), edge=0.12,
                               edge_hex=C.mix_hex(LAMINATE, "#7d786c", 0.5), bevel=0.0025)
    m["steel"] = C.mat("steel", STEEL, edge=0.35, edge_hex=C.G["500"], bevel=0.003)
    m["pad"] = C.mat("pad", PAD, edge=0.25, edge_hex=C.G["600"], bevel=0.0015, noise=0.04)
    m["key_dark"] = C.mat("key_dark", KEY_DARK, edge=0.45, edge_hex=C.G["600"], bevel=0.0008)
    m["key_grey"] = C.mat("key_grey", KEY_GREY, edge=0.35, edge_hex=C.G["300"], bevel=0.0008)
    m["key_lime"] = C.mat("key_lime", KEY_LIME, edge=0.3, edge_hex="#d6f36a", bevel=0.0008)
    m["kbd_case"] = C.mat("kbd_case", "#141416", edge=0.5, edge_hex=C.G["600"], bevel=0.002)
    m["alu"] = C.mat("alu", C.G["400"], edge=0.3, edge_hex=C.G["200"], bevel=0.0008)
    m["laptop"] = C.mat("laptop", "#121214", edge=0.45, edge_hex=C.G["600"], bevel=0.002)
    m["laptop_lid"] = C.mat("laptop_lid", "#151517", edge=0.4, edge_hex=C.G["600"], bevel=0.002)
    m["laptop_key"] = C.mat("laptop_key", "#1b1b1e", edge=0.4, edge_hex=C.G["600"], bevel=0.0005)
    m["laptop_well"] = C.mat("laptop_well", "#08080a", bevel=0.0)
    m["touchpad"] = C.mat("touchpad", "#19191c", edge=0.3, edge_hex=C.G["600"], bevel=0.0005)
    m["vent"] = C.mat("vent", "#050506", bevel=0.0)
    m["bezel"] = C.mat("bezel", "#0c0c0e", edge=0.35, edge_hex=C.G["600"], bevel=0.0015)
    m["mon_back"] = C.mat("mon_back", "#161618", edge=0.35, edge_hex=C.G["600"], bevel=0.004)
    m["stand"] = C.mat("stand", STAND_GREY, edge=0.25, edge_hex=C.G["200"], bevel=0.003)
    m["stand_base"] = C.mat("stand_base", C.G["700"], edge=0.3, edge_hex=C.G["400"], bevel=0.003)
    m["plastic"] = C.mat("plastic", C.G["850"], edge=0.4, edge_hex=C.G["600"], bevel=0.002)
    m["plastic_mid"] = C.mat("plastic_mid", C.G["750"], edge=0.35, edge_hex=C.G["500"], bevel=0.0015)
    m["plastic_light"] = C.mat("plastic_light", C.G["600"], edge=0.3, edge_hex=C.G["400"], bevel=0.001)
    m["label"] = C.mat("label", C.G["700"], bevel=0.0)
    m["fan"] = C.mat("fan", C.G["800"], edge=0.4, edge_hex=C.G["500"], bevel=0.003)
    m["fan_rim"] = C.mat("fan_rim", C.G["600"], edge=0.3, edge_hex=C.G["400"], bevel=0.002)
    m["fan_dark"] = C.mat("fan_dark", "#0b0b0c", bevel=0.0)
    m["blade"] = C.mat("blade", C.G["700"], edge=0.3, edge_hex=C.G["500"], bevel=0.001)
    m["cable"] = C.mat("cable", "#101011", edge=0.0, bevel=0.0)
    m["metal_tip"] = C.mat("metal_tip", C.G["300"], bevel=0.0)
    m["cat"] = C.mat("cat", GREEN, bevel=0.0)
    m["server"] = C.mat("server", C.G["850"], edge=0.4, edge_hex=C.G["500"], bevel=0.003)
    m["server_front"] = C.mat("server_front", C.G["800"], edge=0.35, edge_hex=C.G["500"], bevel=0.002)
    m["legend"] = C.mat("legend", C.G["300"], bevel=0.0)
    m["white"] = C.mat("white", C.G["100"], edge=0.1, edge_hex="#ffffff", bevel=0.002)
    m["pvc"] = C.mat("pvc", "#e4e2dc", edge=0.1, edge_hex="#ffffff", bevel=0.003)
    m["wall"] = C.mat("wall", WALL, bevel=0.0, noise=0.02)
    m["skirting"] = C.mat("skirting", C.mix_hex(FLOOR, "#1a120c", 0.45), edge=0.2,
                          edge_hex=C.mix_hex(FLOOR, "#ffffff", 0.1), bevel=0.002)
    m["floor"] = floor_material()
    m["socket_hole"] = C.mat("socket_hole", "#2a2a2a", bevel=0.0)
    # runtime-only (not baked)
    m["screen"] = C.emission_mat("screen", "#dfe6ff", 1.0)
    m["led"] = C.emission_mat("led", "#dfe6ff", 1.0)
    m["led_green"] = C.emission_mat("led_green", GREEN, 1.0)
    m["led_amber"] = C.emission_mat("led_amber", C.PRIM["amber"], 1.0)
    m["ring"] = C.mat("ring", "#1b1b1d", bevel=0.0)
    m["glow"] = C.emission_mat("glow", GREEN, 0.0)
    m["sky"] = C.emission_mat("sky", "#c9d6e3", 1.0)
    m["hit"] = C.emission_mat("hit", "#ff00ff", 0.0)
    return m


def floor_material():
    """Desaturated wood planks, running front-to-back like the photos."""
    mm = bpy.data.materials.new("floor")
    nt, bsdf, _ = C._principled(mm)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, 0, R(90))
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.offset = 0.37
    br.offset_frequency = 1
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = 1.35
    br.inputs["Row Height"].default_value = 0.135
    br.inputs["Mortar Size"].default_value = 0.0018
    br.inputs["Mortar Smooth"].default_value = 0.2
    br.inputs["Bias"].default_value = 0.0
    br.inputs["Color1"].default_value = C.hex_lin(C.mix_hex(FLOOR, "#2e241c", 0.18))
    br.inputs["Color2"].default_value = C.hex_lin(C.mix_hex(FLOOR, "#8a7563", 0.22))
    br.inputs["Mortar"].default_value = C.hex_lin(C.mix_hex(FLOOR, "#120d09", 0.6))
    nt.links.new(mp.outputs["Vector"], br.inputs["Vector"])
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 3.0
    wave.inputs["Distortion"].default_value = 6.0
    wave.inputs["Detail"].default_value = 2.0
    nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = 0.9
    mr.inputs["To Max"].default_value = 1.06
    nt.links.new(wave.outputs["Fac"], mr.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(br.outputs["Color"], mul.inputs["A"])
    nt.links.new(mr.outputs["Result"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.5
    mm["base_hex"] = FLOOR
    return mm


# ------------------------------------------------------------------ helpers

def rounded_rect(w, h, r, seg=3):
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = R(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def slab_xz(outline, y0, y1):
    """Extrude a 2D outline in the XZ plane from y0 to y1 (front face at y0)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, y0, z)) for x, z in outline]
    back = [bm.verts.new((x, y1, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((front[i], front[(i + 1) % n], back[(i + 1) % n], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bisect_x(bm, x0, x1, step):
    x = x0 + step
    while x < x1 - 1e-6:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(x, 0, 0), plane_no=(1, 0, 0))
        x += step


def bend(bm, cx, front_y, radius):
    """Wrap flat monitor space (x=u along the arc, y=d behind the screen plane)
    onto a cylinder of `radius` whose axis is in front of the screen (1500R)."""
    cyc = front_y - radius
    for v in bm.verts:
        u, d, z = v.co
        th = u / radius
        r = radius + d
        v.co = Vector((cx + r * math.sin(th), cyc + r * math.cos(th), z))


def bm_tube(r_out, r_in, depth, segs=40):
    bm = bmesh.new()
    rings = []
    for r, y in ((r_out, -depth / 2), (r_out, depth / 2), (r_in, depth / 2), (r_in, -depth / 2)):
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), y,
                                    r * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    for k in range(4):
        a, b = rings[k], rings[(k + 1) % 4]
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def obj_from_bm(name, bm, mat_):
    return C.new_obj(name, bm, None, [mat_] if mat_ else None)


def faces_material(ob, fn):
    """Set material_index per face via fn(face_center, normal) -> index."""
    me = ob.data
    for p in me.polygons:
        p.material_index = fn(p.center, p.normal)


def plane(name, corners, mat_, uvs=None):
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in corners]
    f = bm.faces.new(vs)
    if uvs:
        uvl = bm.loops.layers.uv.new("UVMap")
        for loop, uv in zip(f.loops, uvs):
            loop[uvl].uv = uv
    return obj_from_bm(name, bm, mat_)


def hemi(rx, ry, rz, segs=18, rings=7):
    """Upper half-ellipsoid with a flat (removed) bottom."""
    bm = bmesh.new()
    rows = []
    for j in range(rings):
        phi = (math.pi / 2) * j / rings
        rows.append([bm.verts.new((rx * math.cos(phi) * math.cos(2 * math.pi * i / segs),
                                   ry * math.cos(phi) * math.sin(2 * math.pi * i / segs),
                                   rz * math.sin(phi))) for i in range(segs)])
    top = bm.verts.new((0, 0, rz))
    for j in range(rings - 1):
        for i in range(segs):
            a, b = rows[j][i], rows[j][(i + 1) % segs]
            bm.faces.new((a, b, rows[j + 1][(i + 1) % segs], rows[j + 1][i]))
    for i in range(segs):
        bm.faces.new((rows[-1][i], rows[-1][(i + 1) % segs], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def ellipsoid(rx, ry, rz, segs=12, rings=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    return bm


# ------------------------------------------------------------------ desk + frame

def build_desk(m):
    H = D.DESK_H
    w, d, t = D.TOP
    top = C.box("desk_top", (w, d, t), (0, 0, H - t / 2), bevel=D.TOP_BEVEL, segs=2,
                drop_bottom=True)
    top.data.materials.append(m["laminate"])
    top.data.materials.append(m["laminate_edge"])
    faces_material(top, lambda c, n: 0 if n.z > 0.7 else 1)
    Rg(top, 2.0)

    fz = D.FOOT[2]
    for sx in (-1, 1):
        x = sx * D.LEG_X
        foot = C.box(f"foot{sx}", D.FOOT, (x, 0, fz / 2), bevel=0.008, segs=2, mat_=m["steel"],
                     drop_bottom=True)
        # taper the foot ends downwards like the real T-feet
        for v in foot.data.vertices:
            if abs(v.co.y) > 0.22 and v.co.z > 0:
                v.co.z -= (abs(v.co.y) - 0.22) * 0.035
        S(foot, 0.6)
        for sy in (-1, 1):
            S(C.cyl(f"leveler{sx}{sy}", 0.012, 0.006, (x, sy * 0.27, 0.003), segs=10,
                    mat_=m["plastic_mid"]), 0.3)
        lc = D.LOWER_COL
        S(C.box(f"lower{sx}", (lc[0], lc[1], D.LOWER_TOP - fz), (x, 0, fz + (D.LOWER_TOP - fz) / 2),
                bevel=0.004, mat_=m["steel"]), 0.6)
        uc = D.UPPER_COL
        top_z = H - t - D.RAIL[2]
        Rg(C.box(f"upper{sx}", (uc[0], uc[1], top_z - D.UPPER_BOTTOM),
                 (x, 0, D.UPPER_BOTTOM + (top_z - D.UPPER_BOTTOM) / 2), bevel=0.005, segs=2,
                 mat_=m["steel"]), 0.8)
        # sleeve collar where the stages meet
        Rg(C.box(f"collar{sx}", (uc[0] + 0.006, uc[1] + 0.006, 0.02),
                 (x, 0, D.UPPER_BOTTOM + 0.01), bevel=0.003, mat_=m["plastic"]), 0.4)
        Rg(C.box(f"rail{sx}", D.RAIL, (x, 0, H - t - D.RAIL[2] / 2), bevel=0.004,
                 mat_=m["steel"]), 0.5)
    Rg(C.box("crossbar", (2 * D.LEG_X, 0.05, 0.03), (0, 0.03, H - t - 0.02), bevel=0.004,
             mat_=m["steel"]), 0.4)
    # motor housings at each leg top
    for sx in (-1, 1):
        Rg(C.box(f"motor{sx}", (0.09, 0.07, 0.05), (sx * (D.LEG_X - 0.07), 0.03, H - t - 0.03),
                 bevel=0.006, mat_=m["steel"]), 0.3)
    # cable tray under the rear edge
    tw, td, th = D.TRAY
    ty = d / 2 - td / 2 - 0.02
    tz = H - t - th
    for nm, size, loc in (("tray_b", (tw, td, 0.002), (0, ty, tz)),
                          ("tray_f", (tw, 0.002, th), (0, ty - td / 2, tz + th / 2)),
                          ("tray_k", (tw, 0.002, th * 0.7), (0, ty + td / 2, tz + th * 0.35))):
        Rg(C.box(nm, size, loc, bevel=0.0008, mat_=m["steel"]), 0.3)


def build_paddle(m):
    H = D.DESK_H
    pw, pd, ph = D.PADDLE["size"]
    t = D.TOP[2]
    loc = Vector((D.PADDLE["x"], -D.TOP[1] / 2 + pd / 2 - 0.012, H - t - 0.004 - ph / 2))
    M = Matrix.Translation(loc) @ C.euler((-18, 0, 0))
    parts = [C.box("paddle", (pw, pd, ph), (0, 0, 0), bevel=0.004, segs=2, mat_=m["plastic"])]
    fy = -pd / 2
    xs = [-0.022, -0.004, 0.014, 0.032, 0.050]
    labels = ["1", "2", "3", "up", "down"]
    for x, lab in zip(xs, labels):
        parts.append(C.box(f"pbtn_{lab}", (0.0135, 0.003, 0.0125), (x, fy - 0.0012, 0), bevel=0.0012,
                           mat_=m["plastic_mid"]))
        ly = fy - 0.0029
        if lab in ("up", "down"):
            s = 0.0032 if lab == "up" else -0.0032
            bm = bmesh.new()
            vs = [bm.verts.new(v) for v in ((x - 0.0034, ly, -s * 0.8), (x + 0.0034, ly, -s * 0.8),
                                            (x, ly, s * 0.9))]
            f = bm.faces.new(vs)
            r = bmesh.ops.extrude_face_region(bm, geom=[f])
            bmesh.ops.translate(bm, vec=(0, 0.0004, 0),
                                verts=[e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            parts.append(obj_from_bm(f"plab_{lab}", bm, m["legend"]))
        else:
            parts.append(C.text_mesh(f"plab_{lab}", lab, 0.0085, (x, ly, 0), rot=(90, 0, 0),
                                     extrude=0.0002, mat_=m["legend"]))
    for p in parts:
        xform(p, M)
        Rg(p, 3.0 if p.name.startswith(("plab", "pbtn")) else 1.2)
    led = C.box("led_paddle", (0.004, 0.002, 0.004), (-0.042, fy - 0.001, 0.0), bevel=0.0005,
                mat_=m["led"])
    xform(led, M)
    return led


# ------------------------------------------------------------------ laptop

def laptop_matrix():
    L = D.LAPTOP
    return M_at((L["x"], L["y"], D.DESK_H), yaw=L["yaw"])


def build_laptop(m):
    L = D.LAPTOP
    bw, bd, bh = L["base"]
    M = laptop_matrix()
    parts = []
    base = C.box("lap_base", (bw, bd, bh), (0, 0, bh / 2), bevel=0.004, segs=2, drop_bottom=True)
    base.data.materials.append(m["laptop"])
    parts.append(base)
    # palm-rest wear reference (texture space for the material)
    ref = bpy.data.objects.new("laptop_ref", None)
    bpy.context.scene.collection.objects.link(ref)
    ref.matrix_world = M
    palm_wear(m["laptop"], ref)
    top = bh
    kb_y0, kb_y1 = -0.034, 0.098
    parts.append(C.box("lap_well", (0.342, kb_y1 - kb_y0 + 0.004, 0.0006),
                       (0, (kb_y0 + kb_y1) / 2, top + 0.0002), bevel=0.0, mat_=m["laptop_well"]))
    pitch = 0.01785
    rows = [
        [1.5, 1, 1.25, 5.5, 1.25, 1.25, 0.25, 1, 1, 1, 0.25, 2, 1],        # bottom (arrows)
        [2.25] + [1] * 10 + [1.75, 1, 0.25, 1, 1, 1, 1],
        [1.75] + [1] * 11 + [2.25, 0.25, 1, 1, 1, 1],
        [1.5] + [1] * 12 + [1.5, 0.25, 1, 1, 1, 1],
        [1] * 13 + [2, 0.25, 1, 1, 1, 1],
        [1] * 15 + [0.25, 1, 1, 1, 1],                                   # F row (half height)
    ]
    gaps = {6: {6, 10}, 1: {13}, 2: {13}, 3: {14}, 4: {14}, 5: {15}}
    for ri, row in enumerate(rows):
        total = sum(row)
        x = -total * pitch / 2
        y = kb_y0 + 0.009 + ri * pitch + (0.002 if ri == 5 else 0)
        hgt = 0.5 if ri == 5 else 1.0
        for ci, wu in enumerate(row):
            is_gap = wu == 0.25
            if not is_gap:
                kw = wu * pitch - 0.0022
                kd = hgt * pitch - 0.0022
                cy = y - (pitch - hgt * pitch) / 2 if ri == 5 else y
                parts.append(C.box(f"lk{ri}_{ci}", (kw, kd, 0.0016), (x + wu * pitch / 2, cy, top + 0.0009),
                                   bevel=0.0005, top_only=True, drop_bottom=True, mat_=m["laptop_key"]))
            x += wu * pitch
    parts.append(C.box("touchpad", (0.122, 0.074, 0.0005), (-0.028, -0.086, top + 0.0001), bevel=0.0,
                       mat_=m["touchpad"]))
    # rear vents and hinge bar
    for i in range(9):
        x = -0.12 + i * 0.03
        parts.append(C.box(f"vent{i}", (0.022, 0.0012, 0.009), (x, bd / 2 + 0.0002, bh * 0.5),
                           bevel=0.0, mat_=m["vent"]))
    for sx in (-1, 1):
        for i in range(4):
            parts.append(C.box(f"svent{sx}{i}", (0.0012, 0.02, 0.006),
                               (sx * (bw / 2 + 0.0002), 0.07 - i * 0.025, bh * 0.5), bevel=0.0,
                               mat_=m["vent"]))
    hy, hz = bd / 2 - 0.007, bh + 0.0015
    parts.append(C.cyl("hinge", 0.0058, 0.30, (0, hy, hz), rot=(0, 90, 0), segs=12,
                       mat_=m["laptop"]))
    # lid
    lw, lt = bw, L["lid_t"]
    sw, sh = L["screen"]
    lh = L["chin"] + sh + L["bezel_top"]
    tilt = -(L["open_deg"] - 90.0)
    Mlid = Matrix.Translation((0, hy, hz)) @ C.euler((tilt, 0, 0))
    lid = C.box("lid", (lw, lt, lh), (0, 0, lh / 2), bevel=0.003, segs=2)
    lid.data.materials.append(m["bezel"])
    lid.data.materials.append(m["laptop_lid"])
    faces_material(lid, lambda c, n: 0 if n.y < -0.7 else 1)
    xform(lid, Mlid)
    parts.append(lid)
    # a subtle raised panel on the lid back (no logo)
    back_panel = C.box("lid_panel", (lw * 0.7, 0.0008, lh * 0.55), (0, lt / 2 + 0.0003, lh * 0.55),
                       bevel=0.0006, mat_=m["laptop_lid"])
    xform(back_panel, Mlid)
    parts.append(back_panel)
    for p in parts:
        xform(p, M)
        Rg(p, 2.0 if p.name in ("lap_base", "lid") else 5.0 if "vent" in p.name else 1.4)

    # runtime: the screen quad (UV 0..1, stored glTF (0,0) = bottom-left) and hit box
    y_s = -lt / 2 - 0.0005
    zc = L["chin"] + sh / 2
    corners = [(-sw / 2, 0, -sh / 2), (sw / 2, 0, -sh / 2), (sw / 2, 0, sh / 2), (-sw / 2, 0, sh / 2)]
    # Blender UV v is flipped by the glTF exporter (v' = 1 - v): store bl=(0,0) in glTF
    scr = plane("screen_laptop", corners, m["screen"], uvs=[(0, 1), (1, 1), (1, 0), (0, 0)])
    scr.matrix_world = M @ Mlid @ Matrix.Translation((0, y_s, zc))
    hit = C.box("hit_laptop", (lw + 0.01, 0.03, lh + 0.01), (0, 0, lh / 2), bevel=0.0,
                mat_=m["hit"])
    hit.matrix_world = M @ Mlid @ hit.matrix_world
    return scr, hit


def palm_wear(material, ref):
    """Lighten two soft palm patches + keep the edge wear (spec §10)."""
    nt = material.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    src = bsdf.inputs["Base Color"].links[0].from_socket if bsdf.inputs["Base Color"].is_linked else None
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.object = ref
    acc = None
    for px in (-0.105, 0.075):
        sub = nt.nodes.new("ShaderNodeVectorMath")
        sub.operation = "SUBTRACT"
        sub.inputs[1].default_value = (px, -0.095, 0.025)
        nt.links.new(tc.outputs["Object"], sub.inputs[0])
        sc = nt.nodes.new("ShaderNodeVectorMath")
        sc.operation = "MULTIPLY"
        sc.inputs[1].default_value = (1.0, 1.5, 12.0)
        nt.links.new(sub.outputs[0], sc.inputs[0])
        ln = nt.nodes.new("ShaderNodeVectorMath")
        ln.operation = "LENGTH"
        nt.links.new(sc.outputs[0], ln.inputs[0])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = 0.0
        mr.inputs["From Max"].default_value = 0.065
        mr.inputs["To Min"].default_value = 0.22
        mr.inputs["To Max"].default_value = 0.0
        nt.links.new(ln.outputs["Value"], mr.inputs["Value"])
        if acc is None:
            acc = mr.outputs["Result"]
        else:
            mx = nt.nodes.new("ShaderNodeMath")
            mx.operation = "MAXIMUM"
            nt.links.new(acc, mx.inputs[0])
            nt.links.new(mr.outputs["Result"], mx.inputs[1])
            acc = mx.outputs[0]
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    if src is not None:
        nt.links.new(src, mix.inputs["A"])
    else:
        mix.inputs["A"].default_value = bsdf.inputs["Base Color"].default_value
    mix.inputs["B"].default_value = C.hex_lin(C.G["600"])
    nt.links.new(acc, mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])


# ------------------------------------------------------------------ monitor

def mon_geom():
    Mo = D.MON
    sw, sh = Mo["screen"]
    zb = D.DESK_H + Mo["screen_bottom"]
    return dict(cx=Mo["x"], fy=Mo["front_y"], R=Mo["radius"], sw=sw, sh=sh, zb=zb, zc=zb + sh / 2,
                pw=sw + 2 * Mo["bezel"], ph=sh + Mo["bezel"] + Mo["chin"],
                pzc=zb - Mo["chin"] + (sh + Mo["bezel"] + Mo["chin"]) / 2)


def build_monitor(m):
    Mo = D.MON
    g = mon_geom()
    cx, fy, Rr = g["cx"], g["fy"], g["R"]
    # panel: rounded slab, bisected then wrapped to 1500R
    out = [(x, z + g["pzc"]) for x, z in rounded_rect(g["pw"], g["ph"], Mo["corner"], 3)]
    bm = slab_xz(out, 0.0, Mo["panel_t"])
    bisect_x(bm, -g["pw"] / 2, g["pw"] / 2, 0.025)
    bend(bm, cx, fy, Rr)
    panel = obj_from_bm("mon_panel", bm, m["bezel"])
    panel.data.materials.append(m["mon_back"])
    faces_material(panel, lambda c, n: 0 if n.y < -0.5 else 1)
    Rg(panel, 2.0)
    # back housing (the bulge that carries the ring and the stand mount)
    bw, bh, bd = Mo["back"]
    hz = g["zc"] - 0.012
    bmh = C.bm_box((bw, bd, bh), bevel=0.014, segs=2, taper=1.0)
    for v in bmh.verts:  # taper towards the back
        k = (v.co.y + bd / 2) / bd
        v.co.x *= 1.0 - 0.10 * k
        v.co.z *= 1.0 - 0.14 * k
    bmesh.ops.translate(bmh, vec=(0, Mo["panel_t"] + bd / 2 - 0.002, hz), verts=bmh.verts)
    bisect_x(bmh, -bw / 2, bw / 2, 0.03)
    bend(bmh, cx, fy, Rr)
    Rg(obj_from_bm("mon_back", bmh, m["mon_back"]), 1.2)
    back_d = Mo["panel_t"] + bd - 0.002
    # power LED dot bottom-right of the bezel (baked, neutral white)
    dot = C.bm_box((0.003, 0.001, 0.0015))
    u = 0.36
    bmesh.ops.translate(dot, vec=(u, -0.0004, g["zb"] - 0.008), verts=dot.verts)
    bend(dot, cx, fy, Rr)
    Rg(obj_from_bm("mon_led", dot, m["white"]), 0.2)
    # stand: bracket + neck + oval base
    back_y = fy - Rr + (Rr + back_d)
    S_ = D.STAND
    nw, nd = S_["neck"]
    neck_y = back_y + 0.012 + nd / 2
    top_z = hz + 0.05
    base_z = D.DESK_H + D.PAD["size"][2]
    neck = C.box("stand_neck", (nw, nd, top_z - base_z), (cx, neck_y, base_z + (top_z - base_z) / 2),
                 bevel=0.006, segs=2, mat_=m["stand"])
    Rg(neck, 1.0)
    Rg(C.box("stand_bracket", (0.085, 0.03, 0.10), (cx, back_y + 0.005, hz), bevel=0.006, segs=2,
             mat_=m["stand"]), 0.8)
    bw_, bd_, bt_ = S_["base"]
    bmb = bm_oval(bw_ / 2, bd_ / 2, bt_, 28)
    bmesh.ops.translate(bmb, vec=(cx, S_["base_y"], base_z + bt_ / 2), verts=bmb.verts)
    Rg(obj_from_bm("stand_base", bmb, m["stand_base"]), 0.9)
    Rg(C.box("stand_foot", (0.08, 0.05, 0.02), (cx, neck_y + 0.01, base_z + bt_ + 0.01), bevel=0.006,
             mat_=m["stand"]), 0.4)

    # ring (runtime emissive) around the stand mount, following the curved back
    ring_bm = bmesh.new()
    Rring, rt = Mo["ring_r"], Mo["ring_tube"]
    major, minor = 56, 6
    rows = []
    for i in range(major):
        a = 2 * math.pi * i / major
        row = []
        for j in range(minor):
            b = 2 * math.pi * j / minor
            rr = Rring + rt * math.cos(b)
            row.append(ring_bm.verts.new((rr * math.cos(a), back_d + 0.0035 + rt * math.sin(b),
                                          hz + rr * math.sin(a))))
        rows.append(row)
    for i in range(major):
        for j in range(minor):
            ring_bm.faces.new((rows[i][j], rows[(i + 1) % major][j], rows[(i + 1) % major][(j + 1) % minor],
                               rows[i][(j + 1) % minor]))
    bend(ring_bm, cx, fy, Rr)
    bmesh.ops.recalc_face_normals(ring_bm, faces=ring_bm.faces)
    ring = obj_from_bm("ring", ring_bm, m["ring"])
    ring_center = Vector((cx, fy - Rr + (Rr + back_d + 0.0035), hz))
    C.set_origin(ring, ring_center)

    # screen strip (runtime): 48 columns on the arc, UV 0..1
    sbm = bmesh.new()
    uvl = sbm.loops.layers.uv.new("UVMap")
    cols = 48
    cyc = fy - Rr
    r_s = Rr - 0.0006
    vs = []
    for i in range(cols + 1):
        uu = -g["sw"] / 2 + g["sw"] * i / cols
        th = uu / Rr
        x, y = cx + r_s * math.sin(th), cyc + r_s * math.cos(th)
        vs.append((sbm.verts.new((x, y, g["zb"])), sbm.verts.new((x, y, g["zb"] + g["sh"]))))
    for i in range(cols):
        (b0, t0), (b1, t1) = vs[i], vs[i + 1]
        f = sbm.faces.new((b0, b1, t1, t0))
        u0, u1 = i / cols, (i + 1) / cols
        for loop, uv in zip(f.loops, ((u0, 1), (u1, 1), (u1, 0), (u0, 0))):
            loop[uvl].uv = uv
    screen = obj_from_bm("screen_monitor", sbm, m["screen"])
    C.set_origin(screen, (cx, cyc + r_s, g["zc"]))
    hit = C.box("hit_monitor", (g["pw"] + 0.02, 0.12, g["ph"] + 0.02), (cx, fy - 0.03, g["pzc"]),
                bevel=0.0, mat_=m["hit"])
    C.set_origin(hit, (cx, fy - 0.03, g["pzc"]))
    # glow quad on the wall behind the ring (runtime additive), UV 0..1
    gs = 0.9
    wy = D.WALL_Y - 0.004
    glow = plane("ring_glow", [(cx - gs / 2, wy, hz - gs / 2), (cx + gs / 2, wy, hz - gs / 2),
                               (cx + gs / 2, wy, hz + gs / 2), (cx - gs / 2, wy, hz + gs / 2)],
                 m["glow"], uvs=[(0, 1), (1, 1), (1, 0), (0, 0)])
    C.set_origin(glow, (cx, wy, hz))
    return screen, hit, ring, glow


def bm_oval(rx, ry, t, segs):
    bm = C.bm_cyl(1.0, t, segs)
    bmesh.ops.scale(bm, vec=(rx, ry, 1), verts=bm.verts)
    rim = [e for e in bm.edges if len(e.link_faces) == 2 and
           abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
    bmesh.ops.bevel(bm, geom=rim, offset=0.004, segments=2, profile=0.5, affect="EDGES",
                    clamp_overlap=True)
    zmin = min(v.co.z for v in bm.verts)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(abs(v.co.z - zmin) < 1e-6 for v in f.verts)],
                     context="FACES_ONLY")
    return bm


# ------------------------------------------------------------------ keyboard

KBD_ROWS = [
    # (width_u, colour)  colour: d dark, g grey, l lime, - gap
    [(1, "l"), (0.25, "-")] + [(1, "d")] * 4 + [(0.25, "-")] + [(1, "g")] * 4 + [(0.25, "-")]
    + [(1, "d")] * 4 + [(0.25, "-"), (1, "g")],
    [(1, "g")] + [(1, "d")] * 12 + [(2, "g"), (1, "g"), (1, "d"), (1, "d"), (1, "g")],
    [(1.5, "g")] + [(1, "d")] * 12 + [(1.5, "d"), (1, "d"), (1, "d"), (1, "d"), (1, "l")],
    [(1.75, "g")] + [(1, "d")] * 11 + [(2.25, "l"), (1, "d"), (1, "d"), (1, "d"), (1, "g")],
    [(2.25, "g")] + [(1, "d")] * 10 + [(1.75, "g"), (1, "l"), (1, "d"), (1, "d"), (1, "d"), (1, "l")],
    [(1.25, "g"), (1.25, "g"), (1.25, "g"), (6.25, "l"), (1, "g"), (1, "g"), (1, "g"),
     (1, "l"), (1, "l"), (1, "l"), (1, "d"), (1, "g")],
]


def build_keyboard(m):
    K = D.KBD
    kw, kd, kh = K["size"]
    u = K["unit"]
    front = -D.TOP[1] / 2 + K["front_from_edge"]
    cy = front + kd / 2
    lift = kd / 2 * math.sin(R(K["pitch"])) + 0.0005
    M = M_at((K["x"], cy, D.DESK_H + lift), yaw=K["yaw"]) @ C.euler((K["pitch"], 0, 0))
    parts = [C.box("kbd_case", (kw, kd, kh), (0, 0, kh / 2), bevel=0.004, segs=2, mat_=m["kbd_case"],
                   drop_bottom=True)]
    colours = {"d": m["key_dark"], "g": m["key_grey"], "l": m["key_lime"]}
    x0 = -19 * u / 2
    top_row_y = kd / 2 - 0.0085 - u / 2
    row_cap_idx = 0
    knob_x = None
    for ri, row in enumerate(KBD_ROWS):
        y = top_row_y - ri * u - (0.004 if ri > 0 else 0.0)
        x = x0
        for wu, col in row:
            if col != "-":
                h = 0.0088 + RNG.uniform(-0.0003, 0.0003) + (0.0006 if ri in (0, 5) else 0.0)
                cap = C.box(f"cap{ri}_{row_cap_idx}", (wu * u - 0.0024, u - 0.0024, h),
                            (x + wu * u / 2, y, kh + h / 2 - 0.0005), bevel=0.0011, top_only=True,
                            taper=0.80 if wu < 3 else 0.93, drop_bottom=True, mat_=colours[col])
                parts.append(cap)
                row_cap_idx += 1
            x += wu * u
        if ri == 0:
            knob_x = x
    # knob cluster: top right, over the remaining width of the F row
    span = x0 + 19 * u - knob_x
    kx = knob_x + span / 2
    parts.append(C.box("knob_plate", (span - 0.004, u - 0.003, 0.004), (kx, top_row_y, kh + 0.002),
                       bevel=0.0012, mat_=m["alu"]))
    for i in range(3):
        parts.append(C.cyl(f"knob_s{i}", 0.0042, 0.006, (kx - span / 2 + 0.010 + i * 0.012, top_row_y,
                                                          kh + 0.007), segs=12, mat_=m["alu"],
                           bevel=0.0006))
    parts.append(C.cyl("knob_big", 0.0085, 0.013, (kx + span / 2 - 0.012, top_row_y, kh + 0.0095),
                       segs=18, mat_=m["alu"], bevel=0.001))
    for p in parts:
        xform(p, M)
        Rg(p, 1.3 if p.name == "kbd_case" else 1.1)
    led = C.box("led_kbd", (0.003, 0.003, 0.0015), (knob_x - 0.002, top_row_y + 0.008, kh + 0.0006),
                bevel=0.0004, mat_=m["led_green"])
    xform(led, M)
    return led, M


# ------------------------------------------------------------------ pad, mouse, gamepad

def build_pad(m):
    P = D.PAD
    w, d, t = P["size"]
    pad = C.box("pad", (w, d, t), (0, 0, t / 2), bevel=0.0015, segs=2, drop_bottom=True, mat_=m["pad"])
    xform(pad, M_at((P["x"], P["y"], D.DESK_H), yaw=P["yaw"]))
    Rg(pad, 1.4)


def build_mouse(m):
    Mo = D.MOUSE
    L, W, H = Mo["size"]
    bm = hemi(L / 2, W / 2, H, segs=20, rings=8)
    lean = math.tan(R(90 - Mo["tilt"]))
    for v in bm.verts:
        x, y, z = v.co
        k = z / H
        y *= 1.0 - 0.22 * max(0.0, x / (L / 2))          # egg: narrower at the front
        y -= lean * z * 0.55                               # handshake lean to the right
        if y > 0 and 0.2 < k < 0.65 and abs(x) < L * 0.3:  # thumb scoop
            y *= 0.84
        x *= 1.0 - 0.18 * k                                # shell is shorter at the top
        v.co = Vector((x, y, z))
    parts = [obj_from_bm("mouse_shell", bm, m["plastic"])]
    base = bm_oval(L / 2 + 0.003, W / 2 + 0.004, 0.005, 24)
    bmesh.ops.translate(base, vec=(0, 0, 0.0025), verts=base.verts)
    parts.append(obj_from_bm("mouse_base", base, m["plastic_mid"]))
    parts.append(C.cyl("mouse_wheel", 0.0075, 0.006, (L * 0.16, -H * lean * 0.44, H * 0.8),
                       rot=(90, 0, 0), segs=14, mat_=m["plastic_light"]))
    for p in parts:
        xform(p, M_at((Mo["x"], Mo["y"], D.DESK_H + D.PAD["size"][2]), yaw=90 + Mo["yaw"]))
        Rg(p, 1.2)


def build_gamepad(m):
    Gp = D.GAMEPAD
    parts = []
    body = C.bm_box((0.105, 0.058, 0.026), bevel=0.011, segs=2)
    bmesh.ops.translate(body, vec=(0, 0.004, 0.024), verts=body.verts)
    parts.append(obj_from_bm("gp_body", body, m["plastic"]))
    for sx in (-1, 1):
        grip = ellipsoid(0.024, 0.042, 0.019, 16, 10)
        bmesh.ops.transform(grip, matrix=M_at((sx * 0.05, -0.026, 0.02), yaw=sx * 24), verts=grip.verts)
        parts.append(obj_from_bm(f"gp_grip{sx}", grip, m["plastic"]))
        parts.append(C.box(f"gp_bumper{sx}", (0.03, 0.012, 0.008), (sx * 0.038, 0.034, 0.03), bevel=0.003,
                           mat_=m["plastic_mid"]))
    for nm, (x, y) in (("gp_stickL", (-0.031, 0.008)), ("gp_stickR", (0.019, -0.016))):
        parts.append(C.cyl(nm + "_s", 0.005, 0.012, (x, y, 0.041), segs=10, mat_=m["plastic_mid"]))
        parts.append(C.cyl(nm + "_c", 0.0105, 0.004, (x, y, 0.047), segs=16, mat_=m["plastic_mid"],
                           bevel=0.0012))
    parts.append(C.box("gp_dpad_h", (0.019, 0.006, 0.004), (-0.021, -0.016, 0.038), bevel=0.001,
                       mat_=m["plastic_mid"]))
    parts.append(C.box("gp_dpad_v", (0.006, 0.019, 0.004), (-0.021, -0.016, 0.038), bevel=0.001,
                       mat_=m["plastic_mid"]))
    for i, (dx, dy) in enumerate(((0, 0.009), (0.009, 0), (0, -0.009), (-0.009, 0))):
        parts.append(C.cyl(f"gp_btn{i}", 0.0042, 0.004, (0.034 + dx, 0.008 + dy, 0.038), segs=10,
                           mat_=m["plastic_light"]))
    for p in parts:
        xform(p, M_at((Gp["x"], Gp["y"], D.DESK_H), yaw=Gp["yaw"]))
        Rg(p, 1.0)


# ------------------------------------------------------------------ fan + cat

def fan_matrix():
    F = D.FAN
    return M_at((F["x"], F["y"], D.DESK_H + F["center_h"]), yaw=F["yaw"])


def build_fan(m):
    F = D.FAN
    r, dep = F["r"], F["depth"]
    M = fan_matrix()
    parts = [obj_from_bm("fan_housing", bm_tube(r, r - 0.006, dep, 44), m["fan"])]
    lip = C.torus("fan_lip", r - 0.004, 0.0042, (0, -dep / 2, 0), rot=(90, 0, 0), major=44, minor=6,
                  mat_=m["fan_rim"])
    parts.append(lip)
    parts.append(C.cyl("fan_rear", r - 0.006, 0.003, (0, dep / 2 - 0.006, 0), rot=(90, 0, 0), segs=36,
                       mat_=m["fan_dark"]))
    for rr in (0.03, 0.055):
        parts.append(C.torus(f"fan_rgr{rr}", rr, 0.0012, (0, dep / 2 - 0.008, 0), rot=(90, 0, 0), major=32,
                             minor=4, mat_=m["fan"]))
    parts.append(C.cyl("fan_motor", 0.026, 0.03, (0, dep / 2 - 0.022, 0), rot=(90, 0, 0), segs=20,
                       mat_=m["fan"]))
    # front grille: concentric rings + spokes, and the hub cap with its tiny display
    for rr in (0.036, 0.058, 0.078):
        parts.append(C.torus(f"fan_gr{rr}", rr, 0.0011, (0, -dep / 2 + 0.004, 0), rot=(90, 0, 0), major=40,
                             minor=4, mat_=m["fan_rim"]))
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.3
        mid = (0.021 + r - 0.006) / 2
        parts.append(C.box(f"fan_spoke{i}", (r - 0.027, 0.0022, 0.0022),
                           (mid * math.cos(a), -dep / 2 + 0.004, mid * math.sin(a)),
                           rot=(0, -math.degrees(a), 0), bevel=0.0, mat_=m["fan_rim"]))
    parts.append(C.cyl("fan_cap", 0.021, 0.008, (0, -dep / 2 + 0.006, 0), rot=(90, 0, 0), segs=24,
                       mat_=m["fan"], bevel=0.002))
    parts.append(C.box("fan_display", (0.012, 0.001, 0.007), (0, -dep / 2 + 0.0015, 0), bevel=0.0,
                       mat_=m["fan_dark"]))
    # U bracket + pivots + foot
    bz = -F["center_h"] + 0.004
    path = [(-r - 0.009, 0, 0.0), (-r - 0.009, 0, bz + 0.05), (-r + 0.004, 0, bz + 0.012),
            (-0.05, 0, bz + 0.0025), (0.05, 0, bz + 0.0025), (r - 0.004, 0, bz + 0.012),
            (r + 0.009, 0, bz + 0.05), (r + 0.009, 0, 0.0)]
    parts.append(C.sweep("fan_bracket", C.catmull(path, 5), C.rect_profile(0.026, 0.005), m["fan"]))
    for sx in (-1, 1):
        parts.append(C.cyl(f"fan_pivot{sx}", 0.013, 0.01, (sx * (r + 0.005), 0, 0), rot=(0, 90, 0), segs=18,
                           mat_=m["fan_rim"], bevel=0.0015))
    foot = C.bm_box((0.15, 0.075, 0.005), bevel=0.012, segs=2)
    bmesh.ops.translate(foot, vec=(0, 0, bz - 0.0005), verts=foot.verts)
    parts.append(obj_from_bm("fan_foot", foot, m["fan"]))
    for p in parts:
        xform(p, M)
        Rg(p, 1.1)

    # blades: separate node, pivot at hub, spin axis = local Blender Y (= glTF local Z)
    bm = bmesh.new()
    for bi in range(5):
        a0 = 2 * math.pi * bi / 5
        grid = []
        for ri in range(4):
            rad = 0.022 + (0.074 - 0.022) * ri / 3
            row = []
            for ci in range(3):
                a = a0 + (ci / 2 - 0.5) * (0.62 + 0.25 * ri / 3)
                twist = (ci / 2 - 0.5) * 0.016 * (1 - 0.4 * ri / 3)
                row.append(bm.verts.new((rad * math.cos(a), twist, rad * math.sin(a))))
            grid.append(row)
        faces = []
        for ri in range(3):
            for ci in range(2):
                faces.append(bm.faces.new((grid[ri][ci], grid[ri][ci + 1], grid[ri + 1][ci + 1], grid[ri + 1][ci])))
        res = bmesh.ops.extrude_face_region(bm, geom=faces)
        bmesh.ops.translate(bm, vec=(0, 0.0022, 0),
                            verts=[e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    blades = obj_from_bm("fan_blades", bm, m["blade"])
    blades.matrix_world = M @ Matrix.Translation((0, -0.004, 0))
    tag(blades, 0.9)
    return blades


def fan_top_z(x):
    """Height of the fan housing top at cat-local x (cat lies across the round top)."""
    r = D.FAN["r"] + 0.002
    lim = 0.93 * r
    ax = min(abs(x), lim)
    z = math.sqrt(r * r - ax * ax) - r
    return z - max(0.0, abs(x) - lim) * 1.35


def build_cat(m):
    """Faceted low-poly cat built from the brand mark (catuser.png): diamond head
    with two right-triangle ears, prism body with a centre ridge, wedge tail.
    It lies on top of the fan housing like the owner's plush: body along the
    housing's flat top line (front-back), chest and front paws at the front lip,
    tail curling down the laptop-side flank. The head is attached at the neck and
    turned towards the laptop. Parts are world-oriented (identity rotation);
    cat_head pivots at the neck, cat_tail at its base. ~0.22 m nose to tail tip.
    Frame below: fan-local, x = right (towards the laptop), y = back, z = up,
    origin on the housing top."""
    F = D.FAN
    Ct = D.CAT
    base = Vector((F["x"], F["y"], D.DESK_H + F["center_h"] + F["r"] - 0.001))
    Rot = C.euler((0, 0, F["yaw"])).to_3x3()

    def W(p):
        return base + Rot @ Vector(p)

    def prism(bm, sections, cap0=True, cap1=True):
        rings = [[bm.verts.new(W(p)) for p in sec] for sec in sections]
        n = len(sections[0])
        for i in range(len(rings) - 1):
            for j in range(n):
                bm.faces.new((rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]))
        if cap0:
            bm.faces.new(list(reversed(rings[0])))
        if cap1:
            bm.faces.new(rings[-1])
        return rings

    # body: pentagon sections in XZ (belly corners hug the round top, flanks, ridge)
    bm = bmesh.new()
    secs = []
    for y, w, t in ((0.068, 0.027, 0.040), (0.042, 0.036, 0.050), (0.008, 0.039, 0.054),
                    (-0.026, 0.037, 0.052), (-0.046, 0.031, 0.047)):
        bc = fan_top_z(0.82 * w) - 0.002
        secs.append([(-0.82 * w, y, bc), (-w, y, bc + 0.48 * (t - bc)), (0.0, y, t),
                     (w, y, bc + 0.48 * (t - bc)), (0.82 * w, y, bc)])
    rings = prism(bm, secs, cap0=False, cap1=False)
    rump = bm.verts.new(W((0.0, 0.086, 0.022)))
    chest = bm.verts.new(W((0.0, -0.064, 0.020)))
    for j in range(5):
        bm.faces.new((rings[0][j], rings[0][(j + 1) % 5], rump))
        bm.faces.new((rings[-1][(j + 1) % 5], rings[-1][j], chest))
    # front paws: short faceted wedges resting over the front lip
    for x0 in (-0.017, 0.017):
        prism(bm, [[(x0 - 0.010, -0.036, 0.013), (x0 + 0.010, -0.036, 0.013), (x0 + 0.011, -0.036, -0.001),
                    (x0 - 0.011, -0.036, -0.001)],
                   [(x0 - 0.007, -0.064, 0.004), (x0 + 0.007, -0.064, 0.004), (x0 + 0.008, -0.061, -0.009),
                    (x0 - 0.008, -0.061, -0.009)]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = obj_from_bm("cat_body", bm, m["cat"])
    C.set_origin(body, W((0.0, 0.0, 0.0)))
    tag(body, 2.0)

    # head: diamond bi-pyramid (the mark's diamond seen along the gaze) + ear prisms
    neck = Vector((0.0, -0.034, 0.042))
    Hm = (Matrix.Translation(neck) @ C.euler((0, 0, -90.0 + Ct["head_yaw"]))
          @ C.euler((0, -Ct["head_tilt"], 0)))
    s = Ct["head_w"] / 122.0                       # the mark's head is 122 px wide
    hc = Vector((0.016, 0.0, 0.026))
    hw, ht, hb, snout, back = 61 * s, 52 * s, 45 * s, 0.021, 0.016

    def WH(p):  # head frame: x = gaze, y = left, z = up
        return W(Hm @ (hc + Vector(p)))

    bm = bmesh.new()
    Lp, Rp = bm.verts.new(WH((0, hw, 0))), bm.verts.new(WH((0, -hw, 0)))
    Tp, Bp = bm.verts.new(WH((-0.003, 0, ht))), bm.verts.new(WH((0.003, 0, -hb)))
    Fp, Kp = bm.verts.new(WH((snout, 0, -0.004))), bm.verts.new(WH((-back, 0, 0.002)))
    for a, b in ((Lp, Tp), (Tp, Rp), (Rp, Bp), (Bp, Lp)):
        bm.faces.new((a, b, Fp))
        bm.faces.new((b, a, Kp))
    gap = 2 * s
    for sgn in (1, -1):
        # mark ear (px rel. head centre): vertical outer edge, hypotenuse parallel to the head edge
        tri = [(sgn * 61 * s, 60 * s - gap), (sgn * 61 * s, 17 * s - gap), (sgn * 33 * s, 41 * s - gap)]
        front = [bm.verts.new(WH((0.001, yy, zz))) for yy, zz in tri]
        back_ = [bm.verts.new(WH((-0.006, yy * 0.95, zz - 0.002))) for yy, zz in tri]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back_)))
        for i in range(3):
            bm.faces.new((front[i], back_[i], back_[(i + 1) % 3], front[(i + 1) % 3]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    head = obj_from_bm("cat_head", bm, m["cat"])
    C.set_origin(head, W(neck))
    tag(head, 2.0)

    # tail: wedge from the rump curling down the laptop-side flank of the housing
    path = [(0.006, 0.074, 0.030), (0.026, 0.082, fan_top_z(0.026) + 0.016),
            (0.048, 0.072, fan_top_z(0.048) + 0.008), (0.066, 0.046, fan_top_z(0.066) + 0.006),
            (0.078, 0.018, fan_top_z(0.078) + 0.004)]
    sizes = [(0.011, 0.008), (0.012, 0.008), (0.011, 0.007), (0.008, 0.006), (0.003, 0.003)]
    bm = bmesh.new()
    prism(bm, [[(x + dx, y + dy, z + dz) for dx, dy, dz in ((0, 0, w), (t, 0, 0), (0, 0, -w * 0.7), (-t, 0, 0))]
               for (x, y, z), (w, t) in zip(path, sizes)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tail = obj_from_bm("cat_tail", bm, m["cat"])
    C.set_origin(tail, W(path[0]))
    tag(tail, 1.5)
    head_fwd = Rot @ (Hm.to_3x3() @ Vector((1, 0, 0)))
    return body, head, tail, head_fwd


# ------------------------------------------------------------------ charger + cables

def build_charger_and_cables(m, kbd_M):
    Ch = D.CHARGER
    w, d, t = Ch["size"]
    Mc = M_at((Ch["x"], Ch["y"], D.DESK_H), yaw=Ch["yaw"])
    parts = [C.box("charger", (w, d, t), (0, 0, t / 2), bevel=0.006, segs=2, drop_bottom=True,
                   mat_=m["plastic"]),
             C.box("charger_label", (0.07, 0.045, 0.0004), (0.01, 0, t + 0.0001), bevel=0.0,
                   mat_=m["label"])]
    for p in parts:
        xform(p, Mc)
        Rg(p, 1.0)
    H = D.DESK_H
    Lm = laptop_matrix()
    r = 0.0019

    def at(M, p):
        return M @ Vector(p)

    ch_front = at(Mc, (-w / 2 - 0.004, 0, t * 0.5))
    ch_back = at(Mc, (w / 2 + 0.004, 0, t * 0.5))
    lap_left = at(Lm, (-D.LAPTOP["base"][0] / 2 - 0.004, 0.07, 0.012))
    lap_right = at(Lm, (D.LAPTOP["base"][0] / 2 + 0.004, 0.02, 0.012))
    # DC cable: charger -> laptop left port, lazy S on the desk
    Rg(C.cable("cable_dc", [ch_front, ch_front + Vector((0.03, -0.05, -t * 0.5 + r)),
                            Vector((-0.54, 0.05, H + r)), Vector((-0.53, 0.0, H + r)),
                            lap_left + Vector((-0.03, 0.0, -0.012 + r)), lap_left], r=0.0022), 0.6)
    Rg(C.box("dc_plug", (0.018, 0.008, 0.008), lap_left + Vector((-0.006, 0, 0)), rot=(0, 0, D.LAPTOP["yaw"]),
             bevel=0.002, mat_=m["plastic"]), 0.3)
    # AC cable off the back edge, hanging with sag
    Rg(C.cable("cable_ac", [ch_back, ch_back + Vector((0.0, 0.03, -t * 0.5 + r)),
                            Vector((-0.50, D.TOP[1] / 2 + 0.01, H + r)),
                            Vector((-0.49, D.TOP[1] / 2 + 0.03, H - 0.06)),
                            Vector((-0.47, D.TOP[1] / 2 + 0.035, H - 0.2))], r=0.0028), 0.4)
    # keyboard cable: from the back-left of the board to the laptop's right side
    kb_back = kbd_M @ Vector((-0.12, D.KBD["size"][1] / 2 + 0.004, 0.01))
    Rg(C.cable("cable_kbd", [kb_back, kb_back + Vector((0.0, 0.03, -0.01 + r)),
                             Vector((-0.06, 0.02, H + r)), Vector((-0.10, -0.03, H + r)),
                             lap_right + Vector((0.035, 0.0, -0.012 + r)), lap_right], r=0.0017), 0.6)
    # the loose USB-C cable (spec §10): from behind the gamepad, a loop in front
    # of the keyboard, plug end resting on the desk
    pts = [Vector((0.02, 0.17, H + r)), Vector((-0.04, 0.12, H + r)), Vector((-0.09, 0.02, H + r)),
           Vector((-0.085, -0.10, H + r)), Vector((-0.11, -0.19, H + r)), Vector((-0.07, -0.245, H + r)),
           Vector((0.02, -0.232, H + r)), Vector((0.085, -0.214, H + r))]
    Rg(C.cable("cable_usbc", pts, r=0.0017, samples=8), 0.7)
    tip_dir = (pts[-1] - pts[-2]).normalized()
    yaw = math.degrees(math.atan2(tip_dir.y, tip_dir.x))
    Rg(C.box("usbc_plug", (0.022, 0.0075, 0.0055), pts[-1] + tip_dir * 0.011 + Vector((0, 0, 0.001)),
             rot=(0, 0, yaw), bevel=0.0018, mat_=m["plastic"]), 0.6)
    Rg(C.box("usbc_tip", (0.008, 0.0062, 0.0025), pts[-1] + tip_dir * 0.025 + Vector((0, 0, 0.001)),
             rot=(0, 0, yaw), bevel=0.0009, mat_=m["metal_tip"]), 0.4)
    # fan cable over the left edge of the desk with a natural droop
    Fm = fan_matrix()
    fan_back = Fm @ Vector((0, D.FAN["depth"] / 2 + 0.004, -D.FAN["center_h"] + 0.012))
    Rg(C.cable("cable_fan", [fan_back, fan_back + Vector((-0.03, 0.03, -0.006)),
                             Vector((-0.605, -0.08, H + r)), Vector((-0.608, -0.06, H - 0.05)),
                             Vector((-0.60, -0.02, H - 0.14)), Vector((-0.58, 0.02, H - 0.2))], r=0.0019),
       0.4)
    # monitor cables into the tray
    g = mon_geom()
    for i, dx in enumerate((-0.02, 0.012)):
        top = Vector((g["cx"] + dx, D.MON["front_y"] + 0.04, g["zc"] - 0.11))
        Rg(C.cable(f"cable_mon{i}", [top, top + Vector((0.0, 0.05, -0.02)),
                                     Vector((g["cx"] + dx * 2, D.TOP[1] / 2 - 0.005, H + 0.004)),
                                     Vector((g["cx"] + dx * 2 + 0.01, D.TOP[1] / 2 + 0.006, H - 0.02)),
                                     Vector((g["cx"] + 0.04, D.TOP[1] / 2 - 0.03, H - D.TOP[2] - 0.05))],
                   r=0.0026), 0.4)
    # paddle cable: sags under the top back to the tray
    p0 = Vector((D.PADDLE["x"] - 0.04, -D.TOP[1] / 2 + 0.05, H - D.TOP[2] - 0.012))
    p1 = Vector((0.33, D.TOP[1] / 2 - 0.1, H - D.TOP[2] - 0.06))
    Rg(C.sweep("cable_paddle", C.sag(p0, p1, 0.07, 18), C.circle_profile(0.0022, 6), m["cable"]), 0.3)
    # tray -> right leg (rides with the rig); cable_drop continues to the floor
    Rg(C.cable("cable_tray_leg", [Vector((0.38, D.TOP[1] / 2 - 0.06, H - D.TOP[2] - 0.05)),
                                  Vector((0.46, 0.12, H - D.TOP[2] - 0.06)),
                                  Vector((D.LEG_X + 0.004, 0.045, H - D.TOP[2] - 0.04))], r=0.006), 0.3)
    for ob in bpy.data.objects:
        if ob.name.startswith("cable_") and not ob.data.materials:
            ob.data.materials.append(m["cable"])


def build_cable_drop(m):
    """Vertical cable run down the rear-right leg. Origin = floor anchor;
    the runtime scales it along Y (glTF) with the desk height."""
    top_z = D.DESK_H - D.TOP[2] - 0.04
    anchor = Vector((D.LEG_X + 0.03, 0.12, 0.0))
    pts = [anchor + Vector((0.04, 0.08, 0.004)), anchor + Vector((0.0, 0.0, 0.006)),
           Vector((D.LEG_X + 0.004, 0.05, 0.06)), Vector((D.LEG_X + 0.002, 0.046, 0.25)),
           Vector((D.LEG_X + 0.005, 0.046, 0.48)), Vector((D.LEG_X + 0.004, 0.045, top_z))]
    ob = C.cable("cable_drop", pts, r=0.006, samples=6, sides=6)
    ob.data.materials.append(m["cable"])
    C.set_origin(ob, anchor)
    tag(ob, 0.3)
    return ob, top_z


# ------------------------------------------------------------------ server + room

def build_server(m):
    Sv = D.SERVER
    w, d, h = Sv["size"]
    M = M_at((Sv["x"], Sv["y"], 0))
    parts = [C.box("srv_body", (w, d, h), (0, 0, h / 2), bevel=0.004, segs=2, drop_bottom=True,
                   mat_=m["server"])]
    fy = -d / 2
    parts.append(C.box("srv_front", (w - 0.03, 0.004, h - 0.012), (0, fy - 0.001, h / 2), bevel=0.0015,
                       mat_=m["server_front"]))
    for sx in (-1, 1):
        parts.append(C.box(f"srv_ear{sx}", (0.018, 0.006, h - 0.004), (sx * (w / 2 - 0.006), fy - 0.002, h / 2),
                           bevel=0.0015, mat_=m["server"]))
    for i in range(2):
        parts.append(C.box(f"srv_bay{i}", (0.15, 0.003, 0.045), (-0.1, fy - 0.004, 0.13 - i * 0.055),
                           bevel=0.001, mat_=m["plastic_mid"]))
        parts.append(C.box(f"srv_bayh{i}", (0.03, 0.004, 0.006), (-0.04, fy - 0.0058, 0.13 - i * 0.055),
                           bevel=0.001, mat_=m["plastic_light"]))
    for i in range(9):
        parts.append(C.box(f"srv_slot{i}", (0.16, 0.0012, 0.004), (0.1, fy - 0.0032, 0.145 - i * 0.012),
                           bevel=0.0, mat_=m["vent"]))
    parts.append(C.cyl("srv_power", 0.005, 0.004, (0.19, fy - 0.004, 0.03), rot=(90, 0, 0), segs=12,
                       mat_=m["plastic_light"]))
    for p in parts:
        xform(p, M)
        S(p, 4.0 if any(k in p.name for k in ("slot", "bayh", "power")) else 0.6, room=True)
    leds = []
    for i in range(6):
        led = C.box(f"led_srv_{i}", (0.004, 0.002, 0.004), (0.03 + i * 0.012, fy - 0.004, 0.03), bevel=0.0005,
                    mat_=m["led_amber"] if i in (0, 3) else m["led"])
        xform(led, M)
        leds.append(led)
    return leds


def grid_plane(name, us, vs, to3, mat_, near, w_near, w_far, flip=False):
    """Axis-aligned plane split at the given cuts; near cells get more texels."""
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            u0, u1, v0, v1 = us[i], us[i + 1], vs[j], vs[j + 1]
            pts = [to3(u0, v0), to3(u1, v0), to3(u1, v1), to3(u0, v1)]
            if flip:
                pts = list(reversed(pts))
            S(plane(f"{name}_{i}{j}", pts, mat_), w_near if near(i, j) else w_far, room=True)


def build_room(m):
    W0, W1 = D.LEFT_X, D.LEFT_X + D.FLOOR[0]
    Y0, Y1 = D.WALL_Y - D.FLOOR[1], D.WALL_Y
    Hh = D.ROOM_H
    # big surfaces are split so the texels go where the camera looks (the far
    # parts fade into the page background anyway)
    grid_plane("floor", (W0, -1.0, 1.55, W1), (Y0, -1.35, Y1), lambda u, v: (u, v, 0.0), m["floor"],
               near=lambda i, j: i == 1 and j == 1, w_near=0.34, w_far=0.05)
    grid_plane("wall_back", (W0, -0.95, 1.35, W1), (0.0, 1.9, Hh), lambda u, v: (u, Y1, v), m["wall"],
               near=lambda i, j: i == 1 and j == 0, w_near=0.36, w_far=0.05)
    Wn = D.WINDOW
    wy0, wy1 = Wn["y"] - Wn["w"] / 2, Wn["y"] + Wn["w"] / 2
    wz0, wz1 = Wn["sill"], Wn["sill"] + Wn["h"]
    x = W0
    for nm, (a, b, c, e), wgt in (("wl_a", (Y0, wy0 - 0.6, 0, Hh), 0.05), ("wl_a2", (wy0 - 0.6, wy0, 0, Hh), 0.14),
                                  ("wl_b", (wy1, Y1, 0, Hh), 0.14),
                                  ("wl_c", (wy0, wy1, 0, wz0), 0.14), ("wl_d", (wy0, wy1, wz1, Hh), 0.1)):
        S(plane(nm, [(x, a, c), (x, b, c), (x, b, e), (x, a, e)], m["wall"]), wgt, room=True)
    dep = Wn["depth"]
    # reveals of the opening
    # reveals face into the opening (point order sets the normal)
    for nm, pts in (("rev_l", [(x, wy0, wz0), (x, wy0, wz1), (x - dep, wy0, wz1), (x - dep, wy0, wz0)]),
                    ("rev_r", [(x, wy1, wz0), (x - dep, wy1, wz0), (x - dep, wy1, wz1), (x, wy1, wz1)]),
                    ("rev_t", [(x, wy0, wz1), (x, wy1, wz1), (x - dep, wy1, wz1), (x - dep, wy0, wz1)])):
        S(plane(nm, list(reversed(pts)), m["wall"]), 0.12, room=True)
    # window frame (white PVC), mullion, sill
    fx = x - dep * 0.6
    ft = 0.06
    for nm, size, loc in (("wf_b", (0.06, Wn["w"], ft), (fx, Wn["y"], wz0 + ft / 2)),
                          ("wf_t", (0.06, Wn["w"], ft), (fx, Wn["y"], wz1 - ft / 2)),
                          ("wf_l", (0.06, ft, Wn["h"]), (fx, wy0 + ft / 2, (wz0 + wz1) / 2)),
                          ("wf_r", (0.06, ft, Wn["h"]), (fx, wy1 - ft / 2, (wz0 + wz1) / 2)),
                          ("wf_m", (0.07, 0.05, Wn["h"] - 2 * ft), (fx, Wn["y"] + 0.05, (wz0 + wz1) / 2)),
                          ("wf_h", (0.05, Wn["w"] / 2 - ft, 0.04), (fx, Wn["y"] - Wn["w"] / 4, wz0 + 0.42))):
        S(C.box(nm, size, loc, bevel=0.004, mat_=m["pvc"]), 0.4, room=True)
    S(C.box("sill", (dep + 0.06, Wn["w"] + 0.12, 0.022), (x - dep / 2 + 0.03, Wn["y"], wz0 - 0.011),
            bevel=0.003, mat_=m["pvc"]), 0.4, room=True)
    sky = plane("window_sky", [(fx - 0.04, wy0, wz0), (fx - 0.04, wy1, wz0), (fx - 0.04, wy1, wz1),
                               (fx - 0.04, wy0, wz1)], m["sky"], uvs=[(0, 1), (1, 1), (1, 0), (0, 0)])
    C.set_origin(sky, (fx - 0.04, Wn["y"], (wz0 + wz1) / 2))
    # radiator under the window
    rx = x + 0.055
    for i in range(10):
        yy = Wn["y"] - 0.34 + i * 0.075
        S(C.box(f"rad{i}", (0.07, 0.05, 0.5), (rx, yy, 0.40), bevel=0.012, segs=2, mat_=m["white"]), 0.35,
          room=True)
    for zz in (0.18, 0.62):
        S(C.cyl(f"radp{zz}", 0.012, 0.76, (rx, Wn["y"], zz), rot=(90, 0, 0), segs=10, mat_=m["white"]), 0.25,
          room=True)
    # skirting
    S(C.box("skirt_b", (D.FLOOR[0], 0.016, 0.07), ((W0 + W1) / 2, Y1 - 0.008, 0.035), bevel=0.003,
            mat_=m["skirting"]), 0.3, room=True)
    S(C.box("skirt_l", (0.016, D.FLOOR[1], 0.07), (W0 + 0.008, (Y0 + Y1) / 2, 0.035), bevel=0.003,
            mat_=m["skirting"]), 0.3, room=True)
    # wall socket under the desk's left end, black conduit up the wall on the right
    S(C.box("socket", (0.08, 0.009, 0.08), (D.SOCKET["x"], Y1 - 0.0045, D.SOCKET["z"]), bevel=0.004, segs=2,
            mat_=m["white"]), 0.4, room=True)
    for dx in (-0.01, 0.01):
        S(C.cyl(f"sock_h{dx}", 0.0022, 0.004, (D.SOCKET["x"] + dx, Y1 - 0.0095, D.SOCKET["z"]), rot=(90, 0, 0),
                segs=8, mat_=m["socket_hole"]), 0.1, room=True)
    S(C.cyl("conduit", 0.013, Hh, (D.CONDUIT_X, Y1 - 0.02, Hh / 2), segs=10, mat_=m["cable"]), 0.35, room=True)
    for zz in (0.5, 1.2, 1.9):
        S(C.box(f"clip{zz}", (0.034, 0.03, 0.016), (D.CONDUIT_X, Y1 - 0.016, zz), bevel=0.003,
                mat_=m["plastic"]), 0.2, room=True)
    return sky


# ------------------------------------------------------------------ lights + cameras

def build_rigs():
    day = C.coll("rig_day")
    night = C.coll("rig_night")
    # day: sun through the window, sky, soft fill from the front-right
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 4.2
    sun.angle = math.radians(1.2)
    sun.color = C.kelvin(5600)
    so = bpy.data.objects.new("sun", sun)
    day.objects.link(so)
    d = Vector((0.78, 0.38, -0.50)).normalized()
    so.rotation_euler = Vector((0, 0, -1)).rotation_difference(d).to_euler()
    fill = bpy.data.lights.new("fill_day", "AREA")
    fill.shape = "RECTANGLE"
    fill.size, fill.size_y = 2.2, 1.4
    fill.energy = 90.0
    fill.color = C.kelvin(6200)
    fo = bpy.data.objects.new("fill_day", fill)
    day.objects.link(fo)
    fo.location = (1.1, -1.9, 2.1)
    fo.rotation_euler = (Vector((0.05, 0.0, 0.85)) - fo.location).to_track_quat("-Z", "Y").to_euler()
    wd = bpy.data.worlds.new("world_day")
    _world(wd, "#c8d2dc", 0.55)
    # night: dim cool ambient + a warm practical far off-screen; screens/LEDs emit
    wn = bpy.data.worlds.new("world_night")
    _world(wn, "#1a2233", 0.06)
    lamp = bpy.data.lights.new("practical", "POINT")
    lamp.energy = 0.5            # barely perceptible neutral fill; screens carry the room
    lamp.shadow_soft_size = 0.25
    lamp.color = C.kelvin(5200)
    lo = bpy.data.objects.new("practical", lamp)
    night.objects.link(lo)
    lo.location = (1.9, -1.6, 1.6)
    # cool street light through the window: motivated rim light for the left side
    street = bpy.data.lights.new("street", "AREA")
    street.shape = "RECTANGLE"
    street.size, street.size_y = D.WINDOW["w"] * 0.9, D.WINDOW["h"] * 0.9
    street.energy = 15.0
    street.color = C.hex_lin("#8ea4d4")[:3]
    so2 = bpy.data.objects.new("street", street)
    night.objects.link(so2)
    so2.location = (D.LEFT_X - 0.12, D.WINDOW["y"], D.WINDOW["sill"] + D.WINDOW["h"] / 2)
    so2.rotation_euler = (Vector((0.4, -0.2, 0.75)) - so2.location).to_track_quat("-Z", "Y").to_euler()


def _world(w, hex_color, strength):
    w.use_fake_user = True
    try:
        w.use_nodes = True
    except Exception:  # noqa: BLE001
        pass
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = C.hex_lin(hex_color)
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def camera(name, spec, parent=None):
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = "HORIZONTAL"
    cd.angle = math.radians(spec["hfov"])
    cd.clip_start = 0.02
    cd.clip_end = 30.0
    ob = bpy.data.objects.new(name, cd)
    C.coll("cams").objects.link(ob)
    loc = Vector(spec["loc"])
    ob.location = loc
    ob.rotation_euler = (Vector(spec["target"]) - loc).to_track_quat("-Z", "Y").to_euler()
    ob["target"] = list(spec["target"])
    ob["hfov"] = spec["hfov"]
    ob["aspect"] = spec["aspect"]
    if parent is not None:
        C.parent_keep(ob, parent)
    return ob


# ------------------------------------------------------------------ main

def main():
    a = C.args()
    out = Path(a.get("out", str(C.WORK / "desk.blend")))
    C.reset()
    m = build_materials()
    runtime = C.coll("runtime")
    bake_static = C.coll("bake_static")
    bake_rig = C.coll("bake_rig")
    helpers = C.coll("helpers")

    rig = bpy.data.objects.new("desk_rig", None)
    rig.empty_display_type = "PLAIN_AXES"
    rig.location = (0, 0, D.DESK_H)
    bake_rig.objects.link(rig)

    build_desk(m)
    led_paddle = build_paddle(m)
    scr_l, hit_l = build_laptop(m)
    scr_m, hit_m, ring, glow = build_monitor(m)
    led_kbd, kbd_M = build_keyboard(m)
    build_pad(m)
    build_mouse(m)
    build_gamepad(m)
    blades = build_fan(m)
    cat_body, cat_head, cat_tail, head_fwd = build_cat(m)
    build_charger_and_cables(m, kbd_M)
    drop, drop_top = build_cable_drop(m)
    leds_srv = build_server(m)
    sky = build_room(m)

    # merge the baked groups
    static = C.join(PARTS_STATIC, "static")
    C.set_origin(static, (0, 0, 0))
    C.link(static, bake_static)
    desk_baked = C.join(PARTS_RIG, "desk_baked")
    C.set_origin(desk_baked, (0, 0, D.DESK_H))
    C.link(desk_baked, bake_rig)
    C.parent_keep(desk_baked, rig)

    for ob in (scr_l, scr_m, hit_l, hit_m, ring, glow, led_paddle, led_kbd, blades, cat_body):
        C.link(ob, runtime)
        C.parent_keep(ob, rig)
    for ob in (cat_head, cat_tail):
        C.link(ob, runtime)
        C.parent_keep(ob, cat_body)
    for ob in [sky, drop] + leds_srv:
        C.link(ob, runtime)
    ref = bpy.data.objects.get("laptop_ref")
    if ref:
        C.link(ref, helpers)

    # bake membership + runtime-only flags
    for ob in (static, desk_baked, blades, cat_body, cat_head, cat_tail, drop):
        ob["bake"] = True
    for ob in (sky, glow, hit_l, hit_m):
        ob.hide_render = True
    for ob in (hit_l, hit_m):
        ob.display_type = "WIRE"
        ob["hit"] = True
    blades["pivot"] = "hub"
    blades["spin_axis_gltf_local"] = "Z"
    cat_head["pivot"] = "neck"
    cat_tail["pivot"] = "tail_base"
    drop["pivot"] = "floor_anchor"
    drop["top_z"] = drop_top
    rig["pivot"] = "desk_top"
    cat_head["forward"] = list(head_fwd)

    for ob in (static, desk_baked, blades, drop, ring, scr_m):
        smooth(ob)
    build_rigs()
    camera("cam_desk", D.CAM_DESK, parent=rig)
    if "debugcams" in a:
        dbg = C.coll("helpers")
        for nm, spec in (("dbg_cat", dict(loc=(-0.33, -0.80, 1.16), target=(-0.54, -0.235, 0.97), hfov=30, aspect=1.6)),
                         ("dbg_kbd", dict(loc=(0.45, -0.75, 1.05), target=(0.25, -0.05, 0.76), hfov=45, aspect=1.6)),
                         ("dbg_back", dict(loc=(0.78, 0.33, 1.2), target=(0.2, 0.26, 1.0), hfov=60, aspect=1.6))):
            c = camera(nm, spec)
            C.link(c, dbg)
    camera("cam_wide", D.CAM_WIDE)
    sc = bpy.context.scene
    sc.camera = bpy.data.objects["cam_desk"]
    C.apply_rig("night")

    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects
               if o.type == "MESH" and not o.get("hit"))
    print(f"[build] objects={len(bpy.data.objects)} tris={tris}")
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=False)
    print("[build] saved", out)

    if "preview" in a:
        preview(a.get("preview_samples", "48"), a.get("cams", "cam_desk,cam_wide").split(","),
                a.get("rigs", "night,day").split(","))


def smooth(ob, angle=38.0):
    me = ob.data
    me.shade_smooth()
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except AttributeError:  # older API
        pass


def preview(samples, cams=("cam_desk", "cam_wide"), rigs=("night", "day")):
    sc = bpy.context.scene
    dev = C.setup_gpu(sc)
    C.render_settings(int(samples), 1200, 750, denoise=True)
    sc.render.film_transparent = False
    for rig_name in rigs:
        C.apply_rig(rig_name)
        sc.view_settings.exposure = 0.0 if rig_name == "day" else 1.2
        for cam in cams:
            sc.camera = bpy.data.objects[cam]
            sc.render.filepath = str(C.WORK / f"preview-{cam}-{rig_name}.png")
            bpy.ops.render.render(write_still=True)
            print("[preview]", dev, sc.render.filepath)


if __name__ == "__main__":
    main()
