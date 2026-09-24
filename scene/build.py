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

sys.dont_write_bytecode = True  # no __pycache__ in the repo
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
KEY_LIME = C.SC["keyLime"]     # the accent caps' own colour: runtime `rgb off` (baked neutral, R86)
# Recolourable parts (`rgb`, R86): the accent keycaps, the paddle legends and the cat bake with a
# NEUTRAL grey albedo (light only, no colour bleed onto neighbours); the runtime multiplies the
# baked texel by tint / TINT_BASE (linear), day and night alike.
TINT_BASE = C.SC["tintBase"]
TINT_EDGE = C.SC["tintEdge"]
STAND_GREY = C.SC["monitorStand"]
GREEN = C.PRIM["green"]

PARTS_STATIC: list = []
PARTS_RIG: list = []


def tag(ob, weight=1.0, room=False):
    """Per-face atlas weight (texel density) and room flag (edge fade)."""
    me = ob.data
    rv = float(room) if not isinstance(room, bool) else (1.0 if room else 0.0)   # edge-fade weight
    for nm, val in (("uvw", float(weight)), ("room", rv)):
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
    m["key_lime"] = C.mat("key_tint", TINT_BASE, edge=0.3, edge_hex=TINT_EDGE, bevel=0.0008)
    m["kbd_case"] = C.mat("kbd_case", "#141416", edge=0.5, edge_hex=C.G["600"], bevel=0.002)
    m["alu"] = C.mat("alu", C.G["400"], edge=0.3, edge_hex=C.G["200"], bevel=0.0008)
    # laptop stand: matte black powder-coated steel, rubber pads/feet
    m["lstand"] = C.mat("lstand", "#131315", rough=0.75, edge=0.4, edge_hex="#4a4a50", bevel=0.001)
    m["rubber"] = C.mat("rubber", "#0a0a0b", rough=0.9, bevel=0.0)
    m["laptop"] = C.mat("laptop", "#121214", edge=0.45, edge_hex=C.G["600"], bevel=0.002)
    m["laptop_lid"] = C.mat("laptop_lid", "#151517", edge=0.4, edge_hex=C.G["600"], bevel=0.002)
    m["laptop_key"] = C.mat("laptop_key", "#141416", edge=0.4, edge_hex=C.G["600"], bevel=0.0005)
    m["laptop_well"] = C.mat("laptop_well", "#060607", bevel=0.0)
    m["touchpad"] = C.mat("touchpad", "#19191c", edge=0.3, edge_hex=C.G["600"], bevel=0.0005)
    m["vent"] = C.mat("vent", "#050506", bevel=0.0)
    m["bezel"] = C.mat("bezel", "#0c0c0e", edge=0.35, edge_hex=C.G["600"], bevel=0.0015)
    m["mon_back"] = C.mat("mon_back", "#161618", edge=0.35, edge_hex=C.G["600"], bevel=0.004)
    m["stand"] = C.mat("stand", STAND_GREY, edge=0.25, edge_hex=C.G["200"], bevel=0.003)
    m["stand_base"] = C.mat("stand_base", "#131315", rough=0.55, bevel=0.0)   # flat black: no wear lines, no bevel
    m["plastic"] = C.mat("plastic", C.G["850"], edge=0.4, edge_hex=C.G["600"], bevel=0.002)
    m["plastic_mid"] = C.mat("plastic_mid", C.G["750"], edge=0.35, edge_hex=C.G["500"], bevel=0.0015)
    m["plastic_light"] = C.mat("plastic_light", C.G["600"], edge=0.3, edge_hex=C.G["400"], bevel=0.001)
    m["label"] = C.mat("label", C.G["700"], bevel=0.0)
    # fan: lighter graphite so it reads in the night bake; edge wear fakes the sheen
    m["fan"] = C.mat("fan", "#3a3a3e", rough=0.4, edge=0.45, edge_hex="#77777e", bevel=0.003)
    m["fan_rim"] = C.mat("fan_rim", "#28282c", rough=0.4, edge=0.4, edge_hex="#5c5c63", bevel=0.0015)
    m["fan_grille"] = C.mat("fan_grille", "#3c3c41", edge=0.35, edge_hex="#6a6a72", bevel=0.0)
    m["fan_dark"] = C.mat("fan_dark", "#0b0b0c", bevel=0.0)
    m["fan_back"] = C.mat("fan_back", "#1c1c1f", bevel=0.0)
    m["blade"] = C.mat("blade", "#38383d", edge=0.3, edge_hex=C.G["500"], bevel=0.001)
    # gamepad: matte black shell, slightly lighter controls
    m["gp"] = C.mat("gp", "#19191c", rough=0.7, edge=0.5, edge_hex="#4a4a50", bevel=0.0025)
    m["gp_ctl"] = C.mat("gp_ctl", "#2b2b30", rough=0.6, edge=0.45, edge_hex="#55555c", bevel=0.001)
    m["gp_pad"] = C.mat("gp_pad", "#222226", rough=0.5, edge=0.35, edge_hex="#45454b", bevel=0.001)
    m["gp_well"] = C.mat("gp_well", "#0c0c0d", bevel=0.0)
    m["gp_bar"] = C.mat("gp_bar", "#2a3140", rough=0.3, edge=0.2, edge_hex="#4a5570", bevel=0.0)
    m["cable"] = C.mat("cable", "#101011", edge=0.0, bevel=0.0)
    m["metal_tip"] = C.mat("metal_tip", C.G["300"], bevel=0.0)
    # cat: a deeper, slightly desaturated green so the bake shades its facets (not a neon toy)
    m["shadow"] = C.mat("shadow", "#ffffff", rough=1.0, bevel=0.0)
    # pass 9 props: QCY H3S light warm grey matte; slide insole / teeth / eyes / fin
    m["hp"] = C.mat("hp", "#8e8a83", rough=0.6, edge=0.18, edge_hex="#aeaaa3", bevel=0.002)
    m["hp_soft"] = C.mat("hp_soft", "#7f7b75", rough=0.8, edge=0.1, edge_hex="#98948d", bevel=0.003)
    m["insole"] = C.mat("insole", "#e3e9e6", rough=0.9, bevel=0.002)
    m["teeth"] = C.mat("teeth", "#f1f1ea", rough=0.6, bevel=0.0)
    m["shark_eye"] = C.mat("shark_eye", "#17191e", rough=0.5, bevel=0.0)
    m["shark_fin"] = C.mat("shark_fin", "#d7e59f", rough=0.7, bevel=0.0)   # pale yellow-green, as the head top
    # (its own colour, runtime `rgb off`: tokens scene.cat; baked neutral like the accent caps)
    m["cat"] = C.mat("cat", TINT_BASE, rough=0.4, edge=0.25, edge_hex=TINT_EDGE, bevel=0.0)
    m["server"] = C.mat("server", C.G["850"], edge=0.4, edge_hex=C.G["500"], bevel=0.003)
    m["server_front"] = C.mat("server_front", C.G["800"], edge=0.35, edge_hex=C.G["500"], bevel=0.002)
    m["legend"] = C.mat("legend", C.G["300"], bevel=0.0)
    m["legend_hi"] = C.mat("legend_hi", "#f2f2f4", bevel=0.0)
    m["legend_tint"] = C.mat("legend_tint", TINT_BASE, bevel=0.0)   # paddle legends: runtime tint
    m["pbtn"] = C.mat("pbtn", "#1e1e22", edge=0.4, edge_hex=C.G["500"], bevel=0.0008)
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
    m["fan_ring"] = C.emission_mat("fan_ring_rt", GREEN, 1.0)
    m["backlight"] = C.emission_mat("backlight", GREEN, 1.0)
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
            S(C.cyl(f"leveler{sx}{sy}", 0.012, 0.006, (x, sy * 0.27, 0.003), segs=6,
                    mat_=m["plastic_mid"]), 0.3)
        lc = D.LOWER_COL
        low = S(C.box(f"lower{sx}", (lc[0], lc[1], D.LOWER_TOP - fz), (x, 0, fz + (D.LOWER_TOP - fz) / 2),
                      bevel=0.004, mat_=m["steel"]), 0.6)
        # static inner column: its wall shadow is carried by the (rising) wall decal, see bake.py
        a = low.data.attributes.new("legcol", "FLOAT", "FACE")
        a.data.foreach_set("value", [1.0] * len(low.data.polygons))
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
    glyphs = []
    for x, lab in zip(xs, labels):
        parts.append(C.box(f"pbtn_{lab}", (0.0135, 0.003, 0.0125), (x, fy - 0.0012, 0), bevel=0.0012,
                           mat_=m["pbtn"]))
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
            glyphs.append(obj_from_bm(f"plab_{lab}", bm, m["legend_tint"]))
        else:
            glyphs.append(C.text_mesh(f"plab_{lab}", lab, 0.0085, (x, ly, 0), rot=(90, 0, 0),
                                      extrude=0.0002, mat_=m["legend_tint"]))
    for p in parts:
        xform(p, M)
        Rg(p, 6.0 if p.name.startswith("pbtn") else 1.2)
    # the legends are their own baked node (runtime tint, R86)
    for p in glyphs:
        xform(p, M)
        tag(p, 6.0)
    legends = C.join(glyphs, "paddle_glyphs")
    led = C.box("led_paddle", (0.004, 0.002, 0.004), (-0.042, fy - 0.001, 0.0), bevel=0.0005,
                mat_=m["led"])
    xform(led, M)
    # invisible tap targets, one per button (left to right 1 2 3 up down), a bit larger
    # than the cap (1.6 cm wide < 1.8 cm pitch, 1.5 cm deep, 1.6 cm tall); origin = centre
    hits = []
    for x, lab in zip(xs, labels):
        hb = C.box(f"hit_paddle_{lab}", (0.016, 0.015, 0.016), (0, 0, 0), bevel=0.0, mat_=m["hit"])
        hb.matrix_world = M @ Matrix.Translation((x, fy - 0.0045, 0))
        hits.append(hb)
    return led, hits, legends


# ------------------------------------------------------------------ laptop

def laptop_floor():
    """Frame on the desk under the laptop (yawed, not tilted): the stand lives here."""
    L = D.LAPTOP
    return M_at((L["x"], L["y"], D.DESK_H), yaw=L["yaw"])


def laptop_lift():
    """Height of the laptop's bottom-centre above the desk on the stand."""
    L = D.LAPTOP
    return L["front_z"] + L["base"][1] / 2 * math.sin(R(L["tilt"]))


def laptop_matrix():
    """Laptop base frame: origin = bottom centre, deck tilted up towards the back."""
    L = D.LAPTOP
    return laptop_floor() @ Matrix.Translation((0, 0, laptop_lift())) @ C.euler((L["tilt"], 0, 0))


def build_laptop_stand(m):
    """Black foldable steel laptop stand (photo ref-new/1): per side a flat-bar frame
    seen from the side as a scissor - bottom rail on the desk, top rail under the
    laptop (tilted with it), hinged together at the front, two crossed bars in an X
    holding the rear up; a front stop/lip the laptop rests against, silicone strips on
    the top rails, rubber feet, a round cross tube at the rear and at the front."""
    L, St = D.LAPTOP, D.LSTAND
    t = R(L["tilt"])
    hc = laptop_lift()
    hb, tb = St["bar"]
    y0, y1 = St["rail"]
    Mf = laptop_floor()
    parts = []

    def top_pt(yp, dzp):
        """Tilted-frame point (y', z') -> floor frame (y, z)."""
        return Vector((yp * math.cos(t) - dzp * math.sin(t), hc + yp * math.sin(t) + dzp * math.cos(t)))

    def bar(name, x, a, b, h=hb, w=tb, ext=0.0, mat_=None):
        d = b - a
        ln = d.length + 2 * ext
        ang = math.degrees(math.atan2(d.y, d.x))
        c = (a + b) / 2
        return C.box(name, (w, ln, h), (x, c.x, c.y), rot=(ang, 0, 0), bevel=0.0012, segs=1,
                     mat_=mat_ or m["lstand"])

    rail_c = -St["pad"] - hb / 2                       # top rail centre below the laptop bottom
    for sx in (-1, 1):
        xs = sx * St["xs"]
        # top rail (tilted) + silicone strip on it
        a, b = top_pt(y0, rail_c), top_pt(y1, rail_c)
        parts.append(bar(f"ls_top{sx}", xs, a, b))
        pa, pb = top_pt(y0 + 0.012, -St["pad"] / 2), top_pt(y1 - 0.004, -St["pad"] / 2)
        parts.append(bar(f"ls_pad{sx}", xs, pa, pb, h=St["pad"], w=0.012, mat_=m["rubber"]))
        # bottom rail on the desk, rubber feet at both ends
        fz = 0.003 + hb / 2
        ba, bb = Vector((y0 - 0.002, fz)), Vector((y1 + 0.004, fz))
        parts.append(bar(f"ls_bot{sx}", xs, ba, bb))
        for yy in (y0 + 0.006, y1 - 0.004):
            parts.append(C.box(f"ls_foot{sx}{yy:.3f}", (0.010, 0.016, 0.003), (xs, yy, 0.0015), bevel=0.0008,
                               mat_=m["rubber"]))
        # front hinge link: top rail front end down to the bottom rail front end
        hf = top_pt(y0 + 0.005, rail_c)
        parts.append(bar(f"ls_hinge{sx}", xs + sx * tb, Vector((y0 + 0.004, fz)), hf, h=0.012, ext=0.004))
        # front stop: an upturned lip in front of the laptop's front face, rubber faced
        lp0, lp1 = top_pt(-L["base"][1] / 2 - 0.0035, rail_c - 0.002), top_pt(-L["base"][1] / 2 - 0.0035, 0.013)
        parts.append(bar(f"ls_lip{sx}", xs, lp0, lp1, h=0.0045, w=0.02))
        lr0, lr1 = top_pt(-L["base"][1] / 2 - 0.0008, -0.001), top_pt(-L["base"][1] / 2 - 0.0008, 0.0125)
        parts.append(bar(f"ls_lipr{sx}", xs, lr0, lr1, h=0.0012, w=0.017, mat_=m["rubber"]))
        # scissor: two crossed bars (outer one front-bottom -> rear-top, inner one rear-bottom -> front-top)
        A0, A1 = Vector((-0.030, fz)), top_pt(y1 - 0.010, rail_c)
        B0, B1 = Vector((y1 - 0.006, fz)), top_pt(-0.028, rail_c)
        parts.append(bar(f"ls_xa{sx}", xs + sx * tb, A0, A1, ext=0.004))
        parts.append(bar(f"ls_xb{sx}", xs - sx * tb, B0, B1, ext=0.004))
        # crossing point of the two bars -> pivot bolt through all three layers
        d1, d2 = A1 - A0, B1 - B0
        den = d1.x * d2.y - d1.y * d2.x
        k = ((B0.x - A0.x) * d2.y - (B0.y - A0.y) * d2.x) / den
        X = A0 + d1 * k
        for nm, p in (("x", X), ("a0", A0), ("a1", A1), ("b0", B0), ("b1", B1), ("hf", hf)):
            parts.append(C.cyl(f"ls_bolt{nm}{sx}", 0.0032, 3 * tb + 0.004, (xs, p.x, p.y), rot=(0, 90, 0), segs=8,
                               mat_=m["lstand"]))
    # cross tubes tying the two side frames together (rear on the bottom rails, front at the hinge)
    for nm, p in (("rear", Vector((y1 - 0.006, 0.003 + hb / 2))), ("front", top_pt(y0 + 0.005, rail_c))):
        parts.append(C.cyl(f"ls_tube_{nm}", 0.0045, 2 * St["xs"] - tb, (0, p.x, p.y), rot=(0, 90, 0), segs=12,
                           mat_=m["lstand"]))
    for p in parts:
        xform(p, Mf)
        Rg(p, 1.4 if "pad" not in p.name else 0.6)


# laptop keyboard (photo 3d-table-references/new/keyboard.jpg, Acer Nitro V16): all keys full
# chiclets on one pitch; main block 14.5u, numpad 4 x 0.9u packed right after it (the right
# arrow sits in the numpad's first column, under "1"); a short (0.8u) top row of 16 keys over
# the main block (Esc, F1-F4 | F5-F8 | F9-F12, PrtSc Ins Del) + 4 media/power keys over the numpad
LAP_PM = 0.0182                                         # main pitch
LAP_PN = 0.9 * LAP_PM                                   # numpad pitch
LAP_NGAP = 0.08 * LAP_PM                                # main block -> numpad
LAP_MAIN_U = 14.5
LAP_X0 = -(LAP_MAIN_U * LAP_PM + LAP_NGAP + 4 * LAP_PN) / 2
LAP_KEY_GAP = 0.0025                                    # cap-to-cap gap
LAP_FROW = 0.8                                          # top-row key height (u)


def laptop_key_slots(y_bottom):
    """(cx, cy, w, d) per laptop key slot, laptop-local (slots tile each row; the cap is the
    slot minus LAP_KEY_GAP). y_bottom = centre of the bottom row. Rows bottom -> top."""
    pm, pn = LAP_PM, LAP_PN
    xn = LAP_X0 + LAP_MAIN_U * pm + LAP_NGAP            # numpad block left edge
    main = [
        [1, 1, 1, 1, 5.0, 1, 1, 1.5, 1, 1],            # Ctrl Fn Win Alt Space AltGr Menu Copilot < v
        [2.0] + [1] * 10 + [1.5, 1],                    # LShift Z../ RShift ^ (above v)
        [1.4] + [1] * 11 + [2.1],                       # Caps A..' Enter
        [1.4] + [1] * 12 + [1.1],                       # Tab Q..] \
        [1] * 13 + [1.5],                               # ` 1..= Backspace
    ]
    out = []
    for ri, row in enumerate(main):
        assert abs(sum(row) - LAP_MAIN_U) < 1e-9, (ri, sum(row))
        y = y_bottom + ri * pm
        x = LAP_X0
        for wu in row:
            out.append((x + wu * pm / 2, y, wu * pm, pm))
            x += wu * pm
    # numpad (cols 0-3): row 0: > 0 . [Enter]; 1: 1 2 3 [Enter]; 2: 4 5 6 +; 3: 7 8 9 -; 4: N NumLk / *
    for ri in range(5):
        y = y_bottom + ri * pm
        for c in range(4 if ri >= 2 else 3):
            out.append((xn + (c + 0.5) * pn, y, pn, pm))
    out.append((xn + 3.5 * pn, y_bottom + 0.5 * pm, pn, 2 * pm))     # Enter, 2 rows tall
    # top row: 0.8u tall, 16 keys over the main block with two group gaps, 4 over the numpad
    yf = y_bottom + 4 * pm + (1 + LAP_FROW) / 2 * pm
    gg = 0.2 * pm
    pf = (LAP_MAIN_U * pm - 2 * gg) / 16
    x = LAP_X0
    for i in range(16):
        if i in (5, 9):                                 # after F4, after F8
            x += gg
        out.append((x + pf / 2, yf, pf, LAP_FROW * pm))
        x += pf
    for i in range(4):
        out.append((xn + (i + 0.5) * pn, yf, pn, LAP_FROW * pm))
    return out


def bm_chiclet(bm, w, d, h, off, r=0.0011, sides=False):
    """Add a flat keycap with small rounded corners (one chamfer step per corner) to bm, its
    bottom centre at off. sides=False: the cap top only (the 1.6 mm walls are sub-pixel at
    every camera; skipping them keeps the glb inside its budget)."""
    ox, oy, oz = off
    out = rounded_rect(w, d, r, 1) if r > 0 else [(w / 2, d / 2), (-w / 2, d / 2), (-w / 2, -d / 2), (w / 2, -d / 2)]
    hi = [bm.verts.new((ox + x, oy + y, oz + h)) for x, y in out]
    bm.faces.new(hi)
    if sides:
        lo = [bm.verts.new((ox + x, oy + y, oz)) for x, y in out]
        n = len(out)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))


def glow_tiles(name, slots, z, mat_):
    """One flat rect per key slot at height z (the slots tile the key block, so the
    rects only show through the gaps between caps)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    for cx, cy, w, d in slots:
        vs = [bm.verts.new((cx + sx * w / 2, cy + sy * d / 2, z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        f = bm.faces.new(vs)
        for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uvl].uv = uv
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return obj_from_bm(name, bm, mat_)


def build_laptop(m):
    L = D.LAPTOP
    bw, bd, bh = L["base"]
    M = laptop_matrix()
    parts = []
    base = C.box("lap_base", (bw, bd, bh), (0, 0, bh / 2), bevel=0.004, segs=2)  # underside visible now
    base.data.materials.append(m["laptop"])
    parts.append(base)
    # palm-rest wear reference (texture space for the material)
    ref = bpy.data.objects.new("laptop_ref", None)
    bpy.context.scene.collection.objects.link(ref)
    ref.matrix_world = M
    palm_wear(m["laptop"], ref)
    top = bh
    # 16" gaming-laptop deck (photo 3d-table-references/new/keyboard.jpg): full-height chiclet
    # keys recessed in a black well, main block + packed numpad, short top row, a speaker /
    # vent grille strip above it and a wide touchpad centred under the main block
    kb_y0 = -0.017
    slots = laptop_key_slots(kb_y0 + LAP_PM / 2 + 0.001)
    kb_y1 = max(c[1] + c[3] / 2 for c in slots) + 0.001
    kw = LAP_MAIN_U * LAP_PM + LAP_NGAP + 4 * LAP_PN + 0.004
    parts.append(C.box("lap_well", (kw, kb_y1 - kb_y0, 0.0006),
                       (0, (kb_y0 + kb_y1) / 2, top + 0.0002), bevel=0.0, mat_=m["laptop_well"]))
    kbm = bmesh.new()
    for cx, cy, w, d in slots:
        bm_chiclet(kbm, w - LAP_KEY_GAP, d - LAP_KEY_GAP, 0.0016, (cx, cy, top + 0.0002))
    # no recalc_face_normals here: the caps are separate single faces, recalc flips about half
    # of them to face down (culled at runtime -> the backlight tiles showed as green keys);
    # bm_chiclet winds them counter-clockwise = facing up
    parts.append(obj_from_bm("lap_keys", kbm, m["laptop_key"]))
    # speaker / vent grille strip along the top edge of the deck, above the top row
    gy0, gy1 = kb_y1 + 0.004, bd / 2 - 0.016
    parts.append(C.box("lap_grille", (kw, gy1 - gy0, 0.0005), (0, (gy0 + gy1) / 2, top + 0.0001),
                       bevel=0.0, mat_=m["laptop_well"]))
    for i in range(3):
        yy = gy0 + (i + 1) * (gy1 - gy0) / 4
        parts.append(C.box(f"lap_grille_rib{i}", (kw - 0.004, 0.0008, 0.0004), (0, yy, top + 0.0005),
                           bevel=0.0, mat_=m["laptop"]))
    # runtime backlight: one rect per key slot (the slots tile the rows), 0.9 mm above the
    # well, inside the key bodies: the key tops hide it, it shows only in the gaps between keys
    zg = top + 0.0011
    kglow = glow_tiles("laptop_kbd_glow", slots, zg, m["backlight"])
    kglow.matrix_world = M
    xs_ = [c[0] for c in slots]
    ys_ = [c[1] for c in slots]
    C.set_origin(kglow, M @ Vector(((min(xs_) + max(xs_)) / 2, (min(ys_) + max(ys_)) / 2, zg)))
    main_cx = LAP_X0 + LAP_MAIN_U * LAP_PM / 2
    parts.append(C.box("touchpad", (0.130, 0.084, 0.0005), (main_cx, kb_y0 - 0.008 - 0.042, top + 0.0001),
                       bevel=0.0, mat_=m["touchpad"]))
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
    # Blender UV (0,0) = bottom-left of the image; the exporter flips v, so glTF stores
    # the standard (0,0) = top-left (runtime: CanvasTexture flipY=false)
    scr = plane("screen_laptop", corners, m["screen"], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    scr.matrix_world = M @ Mlid @ Matrix.Translation((0, y_s, zc))
    hit = C.box("hit_laptop", (lw + 0.01, 0.03, lh + 0.01), (0, 0, lh / 2), bevel=0.0,
                mat_=m["hit"])
    hit.matrix_world = M @ Mlid @ hit.matrix_world
    return scr, hit, kglow


def palm_wear(material, ref):
    """Lighten two soft palm patches + keep the edge wear (spec §10)."""
    nt = material.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    src = bsdf.inputs["Base Color"].links[0].from_socket if bsdf.inputs["Base Color"].is_linked else None
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.object = ref
    acc = None
    for px in (-0.125, 0.07):
        sub = nt.nodes.new("ShaderNodeVectorMath")
        sub.operation = "SUBTRACT"
        sub.inputs[1].default_value = (px, -0.085, 0.025)
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


def mon_swivel():
    return C.swivel(D.MON["x"], D.mon_neck_y(), D.MON["yaw"])


def build_monitor(m):
    Mo = D.MON
    g = mon_geom()
    cx, fy, Rr = g["cx"], g["fy"], g["R"]
    n0 = len(PARTS_RIG)
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
    bisect_x(bmh, -bw / 2, bw / 2, 0.06)     # pass 11: 3 -> 6 cm slices (faces the wall, never seen)
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
    assert abs(neck_y - D.mon_neck_y()) < 1e-9
    top_z = hz + 0.05
    base_z = D.DESK_H                                   # the base plate stands on the desk
    neck = C.box("stand_neck", (nw, nd, top_z - base_z), (cx, neck_y, base_z + (top_z - base_z) / 2),
                 bevel=0.006, segs=2, mat_=m["stand"])
    Rg(neck, 1.0)
    Rg(C.box("stand_bracket", (0.085, 0.03, 0.10), (cx, back_y + 0.005, hz), bevel=0.006, segs=2,
             mat_=m["stand"]), 0.8)
    bw_, bd_, bt_ = S_["base"]
    bmb = bmesh.new()                                   # flat rectangular slab, square corners
    out = [(bw_ / 2, bd_ / 2), (-bw_ / 2, bd_ / 2), (-bw_ / 2, -bd_ / 2), (bw_ / 2, -bd_ / 2)]
    lo = [bmb.verts.new((cx + x, fy + S_["base_dy"] + y, base_z)) for x, y in out]
    hi = [bmb.verts.new((cx + x, fy + S_["base_dy"] + y, base_z + bt_)) for x, y in out]
    bmb.faces.new(hi)
    for i in range(len(out)):
        j = (i + 1) % len(out)
        bmb.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bmb, faces=bmb.faces)
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
        for loop, uv in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
            loop[uvl].uv = uv
    screen = obj_from_bm("screen_monitor", sbm, m["screen"])
    C.set_origin(screen, (cx, cyc + r_s, g["zc"]))
    hit = C.box("hit_monitor", (g["pw"] + 0.02, 0.12, g["ph"] + 0.02), (cx, fy - 0.03, g["pzc"]),
                bevel=0.0, mat_=m["hit"])
    C.set_origin(hit, (cx, fy - 0.03, g["pzc"]))
    # swivel the whole monitor (panel, housing, stand, ring, screen, hit box) about the neck
    Sw = mon_swivel()
    for ob in PARTS_RIG[n0:] + [ring, screen, hit]:
        xform(ob, Sw)
    # glow quad on the wall behind the ring (runtime additive), UV 0..1: stays on the wall,
    # centred straight behind the swivelled ring
    gs = 0.9
    wy = D.WALL_Y - 0.004
    cx = ring.matrix_world.translation.x
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

# 96% / "1800 compact" board as photographed (ref IMG_..._130902): 20u wide.
# Each entry: (x in u from the left, width u, colour) with colour d dark, g grey, l lime.
# Rows top (F row) -> bottom. The numpad '+' and Enter are 2 rows tall (KBD_TALL).
def _row(*items, x=0.0):
    out = []
    for it in items:
        if isinstance(it, (int, float)):                 # gap
            x += it
            continue
        w, c = it
        out.append((x, w, c))
        x += w
    return out


KBD_ROWS = [
    _row((1, "l"), 0.5, *[(1, "d")] * 4, 0.5, *[(1, "g")] * 4, 0.5, *[(1, "d")] * 4, 0.5, (1, "g")),
    _row(*[(1, "d")] * 13, (2, "l"), (1, "g"), (1, "g"), (1, "g"), (1, "g"), (1, "g")),
    _row((1.5, "g"), *[(1, "d")] * 12, (1.5, "d"), (1, "g"), (1, "d"), (1, "d"), (1, "d")),
    _row((1.75, "g"), *[(1, "d")] * 11, (2.25, "g"), (1, "g"), (1, "d"), (1, "d"), (1, "d")),
    _row((2.25, "g"), *[(1, "d")] * 10, (1.75, "g"), (1, "l"), (1, "g"), (1, "d"), (1, "d"), (1, "d")),
    _row((1.25, "g"), (1.25, "g"), (1.25, "g"), (6.25, "l"), (1, "g"), (1, "g"), (1, "g"),
         (1, "l"), (1, "l"), (1, "l"), (2, "d"), (1, "d")),
]
KBD_TALL = [(2, 19, "g"), (4, 19, "l")]                 # (top row, x u, colour): numpad + and Enter
# OEM-like sculpt per row: cap height above the plate (m) and top-face angle (deg, >0 = back higher)
KBD_PROFILE = {0: (0.0112, 9.0), 1: (0.0108, 7.0), 2: (0.0094, 3.0), 3: (0.0088, 0.0), 4: (0.0092, -4.0),
               5: (0.0094, -7.0)}


def bm_keycap(w, d, h, tilt, gap=0.0008):
    """Low-poly sculpted cap: chamfered-rect skirt, tapered sides, top shifted back and
    angled per row, a shallow dish (inner ring lowered). ~38 tris."""
    bw, bd = w - gap, d - gap
    tw, td = bw - 0.0046, bd - 0.0052
    ty = 0.0008                                          # top sits a touch towards the back
    k = math.tan(math.radians(tilt))

    def ring(rw, rd, c, yoff, zf):
        pts = [(rw / 2, -rd / 2 + c), (rw / 2, rd / 2 - c), (rw / 2 - c, rd / 2), (-rw / 2 + c, rd / 2),
               (-rw / 2, rd / 2 - c), (-rw / 2, -rd / 2 + c), (-rw / 2 + c, -rd / 2), (rw / 2 - c, -rd / 2)]
        return [(x, y + yoff, zf(y + yoff)) for x, y in pts]

    bm = bmesh.new()
    r0 = [bm.verts.new(p) for p in ring(bw, bd, 0.0012, 0.0, lambda y: 0.0)]
    r1 = [bm.verts.new(p) for p in ring(tw, td, 0.0016, ty, lambda y: h + k * y)]
    r2 = [bm.verts.new(p) for p in ring(tw - 0.003, td - 0.003, 0.0012, ty, lambda y: h + k * y - 0.0006)]
    for a, b in ((r0, r1), (r1, r2)):
        for i in range(8):
            j = (i + 1) % 8
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(r2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_keyboard(m):
    K = D.KBD
    kw, kd, kh = K["size"]
    u = K["unit"]
    border = 0.0095
    front = -D.TOP[1] / 2 + K["front_from_edge"]
    cy = front + kd / 2
    lift = kd / 2 * math.sin(R(K["pitch"])) + 0.0005
    M = M_at((K["x"], cy, D.DESK_H + lift), yaw=K["yaw"])
    if K.get("rest_on_pad"):
        # numpad end on the pad: roll up by the pad thickness about the case's left bottom edge
        roll = math.degrees(math.atan2(D.PAD["size"][2] + 0.0005, kw))
        M = M @ Matrix.Translation((-kw / 2, 0, 0)) @ C.euler((0, -roll, 0)) @ Matrix.Translation((kw / 2, 0, 0))
    M = M @ C.euler((K["pitch"], 0, 0))
    case = C.box("kbd_case", (kw, kd, kh), (0, 0, kh / 2), bevel=0.004, segs=2, mat_=m["kbd_case"],
                 drop_bottom=True)
    for v in case.data.vertices:                         # slight front slope
        if v.co.y < -kd / 2 + 0.006:
            v.co.y += 0.004 * max(0.0, v.co.z) / kh
    parts = [case]
    x0 = -20 * u / 2
    top_row_y = kd / 2 - border - u / 2
    fgap = 0.004                                        # F row stands a little apart

    def row_y(ri):
        return top_row_y - ri * u - (fgap if ri > 0 else 0.0)

    # raised rim around the plate (the photos' thick frame): hides the backlight edges
    iy0, iy1 = row_y(5) - u / 2 - 0.0008, top_row_y + u / 2 + 0.0008
    ix0, ix1 = x0 - 0.0008, -x0 + 0.0008
    rh = 0.0045
    for nm, (a, b, c, d_) in (("kbd_rim_f", (-kw / 2, kw / 2, -kd / 2, iy0)), ("kbd_rim_b", (-kw / 2, kw / 2, iy1, kd / 2)),
                              ("kbd_rim_l", (-kw / 2, ix0, iy0, iy1)), ("kbd_rim_r", (ix1, kw / 2, iy0, iy1))):
        parts.append(C.box(nm, (b - a, d_ - c, rh), ((a + b) / 2, (c + d_) / 2, kh + rh / 2 - 0.001), bevel=0.0015,
                           mat_=m["kbd_case"], drop_bottom=True))
    colours = {"d": m["key_dark"], "g": m["key_grey"], "l": m["key_lime"]}
    accent = []   # the lime caps: their own baked node `kbd_accent` (runtime tint, R86)
    slots = []
    n = 0
    for ri, row in enumerate(KBD_ROWS):
        h, tilt = KBD_PROFILE[ri]
        for xu, wu, col in row:
            bm = bm_keycap(wu * u, u, h + RNG.uniform(-0.0002, 0.0002), tilt)
            cx, cyy = x0 + (xu + wu / 2) * u, row_y(ri)
            bmesh.ops.translate(bm, vec=(cx, cyy, kh - 0.0005), verts=bm.verts)
            (accent if col == "l" else parts).append(obj_from_bm(f"cap{ri}_{n}", bm, colours[col]))
            slots.append((cx, cyy, wu * u, u))
            n += 1
    for ri, xu, col in KBD_TALL:
        h = (KBD_PROFILE[ri][0] + KBD_PROFILE[ri + 1][0]) / 2
        bm = bm_keycap(u, 2 * u, h, 0.0)
        cx, cyy = x0 + (xu + 0.5) * u, (row_y(ri) + row_y(ri + 1)) / 2
        bmesh.ops.translate(bm, vec=(cx, cyy, kh - 0.0005), verts=bm.verts)
        (accent if col == "l" else parts).append(obj_from_bm(f"capt{ri}", bm, colours[col]))
        slots.append((cx, cyy, u, 2 * u))
    # control panel over the numpad columns of the F row: alu plate, 3 small knobs + a big one
    knob_x = x0 + 16 * u
    span = 4 * u
    kx = knob_x + span / 2
    parts.append(C.box("knob_plate", (span - 0.001, u - 0.002, 0.004), (kx, top_row_y, kh + 0.002),
                       bevel=0.0012, mat_=m["alu"]))
    for i in range(3):
        parts.append(C.cyl(f"knob_s{i}", 0.0042, 0.006, (kx - span / 2 + 0.010 + i * 0.012, top_row_y,
                                                          kh + 0.007), segs=12, mat_=m["key_dark"],
                           bevel=0.0006))
    parts.append(C.cyl("knob_big", 0.0085, 0.013, (kx + span / 2 - 0.012, top_row_y, kh + 0.0095),
                       segs=18, mat_=m["key_dark"], bevel=0.001))
    for p in parts:
        xform(p, M)
        Rg(p, 1.3 if p.name == "kbd_case" else 1.1)
    for p in accent:
        xform(p, M)
        tag(p, 1.1)
    kbd_accent = C.join(accent, "kbd_accent")
    led = C.box("led_kbd", (0.003, 0.003, 0.0015), (knob_x + 0.0035, top_row_y - u / 2 + 0.0035, kh + 0.0045),
                bevel=0.0004, mat_=m["led_green"])
    xform(led, M)
    # runtime backlight: one rect per key slot 1.2 mm above the plate, under the cap tops;
    # the slots tile the key block (none under the F-row gaps / knob panel), the rim hides the edges
    zg = kh + 0.0012
    glow = glow_tiles("kbd_glow", slots, zg, m["backlight"])
    glow.matrix_world = M
    C.set_origin(glow, M @ Vector((0.0, (iy0 + iy1) / 2, zg)))
    return led, M, glow, kbd_accent


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


GP_HALF = [  # right half of the top-view outline (x right, y back), DS4-like, ~0.16 m wide
    (0.0, 0.031), (0.030, 0.032), (0.052, 0.031), (0.066, 0.028), (0.075, 0.020), (0.0795, 0.008),
    (0.0805, -0.008), (0.079, -0.025), (0.074, -0.042), (0.066, -0.056), (0.056, -0.064),
    (0.046, -0.065), (0.038, -0.058), (0.033, -0.043), (0.028, -0.030), (0.018, -0.023),
    (0.0, -0.021),
]
GP_T = 0.030                  # shell thickness before the grips droop


def gp_droop(bm):
    """Handles angle down/back: shear verts down in front of the body (towards the
    viewer), more towards the tips, so the pad rests on the grip ends + the back."""
    for v in bm.verts:
        x, y, z = v.co
        k = max(0.0, -0.012 - y)
        spread = min(1.0, abs(x) / 0.035)
        v.co.z = z - (0.34 * k + 2.2 * k * k) * (0.35 + 0.65 * spread)


def build_gamepad(m):
    """Controller inspired by the DS4 silhouette (no logos, no brand text): wide
    body with two handles angled down/back, flat touchpad centre top, symmetric
    sticks lower centre, D-pad upper left, four plain face buttons upper right,
    share/options pills beside the touchpad, shoulder buttons + a dim light bar
    strip on the back top edge. Matte black, bevelled."""
    Gp = D.GAMEPAD
    outline = GP_HALF + [(-x, y) for x, y in reversed(GP_HALF[1:-1])]
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, 0.0)) for x, y in outline]
    top = [bm.verts.new((x, y, GP_T)) for x, y in outline]
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    n = len(outline)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rim = [e for e in bm.edges if len(e.link_faces) == 2 and
           abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
    bmesh.ops.bevel(bm, geom=rim, offset=0.0085, segments=3, profile=0.55, affect="EDGES",
                    clamp_overlap=True)
    # cut the big caps so the droop bends them smoothly
    for yc in (-0.004, -0.016, -0.028, -0.040, -0.052):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, yc, 0), plane_no=(0, 1, 0))
    for xc in (-0.05, -0.03, 0.03, 0.05):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(xc, 0, 0), plane_no=(1, 0, 0))
    shell = [("gp_body", bm, m["gp"])]

    T = GP_T
    ctl = []                                                  # (name, bm, mat)

    def add_cyl(name, r, h, x, y, z, mat_, segs=16, bevel=0.0):
        c = C.bm_cyl(r, h, segs)
        if bevel > 0:
            rim_ = [e for e in c.edges if len(e.link_faces) == 2 and
                    abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
            bmesh.ops.bevel(c, geom=rim_, offset=bevel, segments=2, profile=0.5, affect="EDGES",
                            clamp_overlap=True)
        bmesh.ops.translate(c, vec=(x, y, z + h / 2), verts=c.verts)
        ctl.append((name, c, mat_))

    def add_box(name, size, x, y, z, mat_, bevel=0.0, rot=0.0):
        c = C.bm_box(size, bevel=bevel, segs=2 if bevel else 1)
        if rot:
            bmesh.ops.rotate(c, cent=(0, 0, 0), matrix=C.euler((0, 0, rot)).to_3x3(), verts=c.verts)
        bmesh.ops.translate(c, vec=(x, y, z + size[2] / 2), verts=c.verts)
        ctl.append((name, c, mat_))

    # touchpad: flat rounded rectangle, slightly proud, with a hairline gap around it
    pad = C.bm_box((0.056, 0.030, 0.0026), bevel=0.003, segs=2, top_only=True, drop_bottom=True)
    bmesh.ops.translate(pad, vec=(0, 0.013, T - 0.0006), verts=pad.verts)
    ctl.append(("gp_touchpad", pad, m["gp_pad"]))
    add_box("gp_touch_gap", (0.0585, 0.0325, 0.0008), 0, 0.013, T - 0.0002, m["gp_well"])
    # share / options pills beside the touchpad
    for sx in (-1, 1):
        add_box(f"gp_opt{sx}", (0.0035, 0.009, 0.003), sx * 0.036, 0.021, T - 0.0006, m["gp_ctl"],
                bevel=0.0012, rot=sx * -18.0)
    # D-pad (upper left): shallow round well + four separate arrows
    dx, dy = -0.052, 0.004
    add_cyl("gp_dpad_well", 0.0175, 0.0012, dx, dy, T - 0.0006, m["gp_well"], segs=16)
    for i, (ox, oy) in enumerate(((0, 1), (1, 0), (0, -1), (-1, 0))):
        w, d = (0.0072, 0.0095) if ox == 0 else (0.0095, 0.0072)
        add_box(f"gp_dpad{i}", (w, d, 0.0038), dx + ox * 0.0078, dy + oy * 0.0078, T - 0.0004, m["gp_ctl"],
                bevel=0.0013)
    # four face buttons (upper right), plain round
    bx, by = 0.052, 0.004
    add_cyl("gp_btn_well", 0.0185, 0.0012, bx, by, T - 0.0006, m["gp_well"], segs=16)
    for i, (ox, oy) in enumerate(((0, 1), (1, 0), (0, -1), (-1, 0))):
        add_cyl(f"gp_btn{i}", 0.0048, 0.0042, bx + ox * 0.0098, by + oy * 0.0098, T - 0.0004, m["gp_ctl"],
                segs=10, bevel=0.0012)   # pass 9: 16 -> 10 segs (glb budget for the new props)
    # analog sticks: symmetric, lower centre, each in a round well
    for sx in (-1, 1):
        x, y = sx * 0.024, -0.018
        add_cyl(f"gp_stick_well{sx}", 0.0135, 0.0012, x, y, T - 0.0006, m["gp_well"], segs=16)
        add_cyl(f"gp_stick_stem{sx}", 0.0045, 0.009, x, y, T - 0.0004, m["gp_ctl"], segs=12)
        add_cyl(f"gp_stick_cap{sx}", 0.0105, 0.0042, x, y, T + 0.0082, m["gp_ctl"], segs=16, bevel=0.0014)
        rim_ = C.bm_cyl(0.0082, 0.0012, 24)
        bmesh.ops.translate(rim_, vec=(x, y, T + 0.0130), verts=rim_.verts)
        ctl.append((f"gp_stick_dish{sx}", rim_, m["gp_well"]))
    # shoulders: L1/R1 on the back edge, L2/R2 triggers under/behind them
    for sx in (-1, 1):
        add_box(f"gp_l1{sx}", (0.030, 0.008, 0.007), sx * 0.052, 0.033, T - 0.010, m["gp_ctl"], bevel=0.0025)
        add_box(f"gp_l2{sx}", (0.026, 0.010, 0.010), sx * 0.054, 0.031, T - 0.024, m["gp_ctl"], bevel=0.003)
    # light bar: thin strip across the back top edge (baked, dim)
    add_box("gp_lightbar", (0.052, 0.0022, 0.0035), 0, 0.0318, T - 0.0065, m["gp_bar"], bevel=0.0008)

    Mw = M_at((Gp["x"], Gp["y"], D.DESK_H), yaw=Gp["yaw"])
    objs = []
    allbm = shell + ctl
    for name, b_, _ in allbm:
        gp_droop(b_)
    zmin = min(v.co.z for _, b_, _ in allbm for v in b_.verts)
    for name, b_, mat_ in allbm:
        bmesh.ops.translate(b_, vec=(0, 0, -zmin), verts=b_.verts)
        ob = obj_from_bm(name, b_, mat_)
        xform(ob, Mw)
        Rg(ob, 1.6 if name == "gp_body" else 1.2)
        objs.append(ob)
    return objs


# ------------------------------------------------------------------ fan + cat

FAN_DISPLAY = (0.024, 0.012)   # w, h of the readout quad (2:1, the 256x128 canvas)


def fan_matrix():
    F = D.FAN
    return M_at((F["x"], F["y"], D.DESK_H + F["center_h"]), yaw=F["yaw"])


def bm_annulus_torus(R, dr, dy, y, major=56, minor=8):
    """Torus with an elliptical tube (radial half-width dr, axial half-depth dy),
    axis = Blender Y, centred at (0, y, 0): a flat glowing band around a bezel."""
    bm = bmesh.new()
    rows = []
    for i in range(major):
        a = 2 * math.pi * i / major
        row = []
        for j in range(minor):
            b = 2 * math.pi * j / minor
            rr = R + dr * math.cos(b)
            row.append(bm.verts.new((rr * math.cos(a), y + dy * math.sin(b), rr * math.sin(a))))
        rows.append(row)
    for i in range(major):
        for j in range(minor):
            bm.faces.new((rows[i][j], rows[(i + 1) % major][j], rows[(i + 1) % major][(j + 1) % minor],
                          rows[i][(j + 1) % minor]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_fan(m):
    """Round desk fan in a U bracket (photos): graphite housing, a flat front bezel
    that carries the RGB ring (runtime `fan_ring`), a fine concentric front grille,
    a hub with a small digital readout (runtime `fan_display`), rear grille, and
    a wide flat U bracket that sits straight on the desk with round pivot knobs."""
    F = D.FAN
    r, dep = F["r"], F["depth"]
    M = fan_matrix()
    fy = -dep / 2                                    # front plane (fan-local, -Y faces the viewer)
    parts = [obj_from_bm("fan_housing", bm_tube(r, r - 0.006, dep, 48), m["fan"])]
    # rolled rear lip + flat front bezel (annulus slab) proud of the housing
    parts.append(C.torus("fan_lip_back", r - 0.003, 0.0035, (0, dep / 2, 0), rot=(90, 0, 0), major=40,
                         minor=4, mat_=m["fan"]))
    bez = bm_tube(r + 0.0006, r - 0.0105, 0.004, 48)
    bmesh.ops.translate(bez, vec=(0, fy - 0.0015, 0), verts=bez.verts)
    parts.append(obj_from_bm("fan_bezel", bez, m["fan_rim"]))
    parts.append(C.cyl("fan_rear", r - 0.006, 0.003, (0, dep / 2 - 0.006, 0), rot=(90, 0, 0), segs=20,
                       mat_=m["fan_back"]))
    for rr in (0.03, 0.055, 0.075):
        parts.append(C.torus(f"fan_rgr{rr}", rr, 0.0012, (0, dep / 2 - 0.008, 0), rot=(90, 0, 0), major=16,
                             minor=3, mat_=m["fan_grille"]))   # pass 11: 28 -> 16 (rear, never seen)
    parts.append(C.cyl("fan_motor", 0.026, 0.03, (0, dep / 2 - 0.022, 0), rot=(90, 0, 0), segs=12,
                       mat_=m["fan_back"]))
    # front grille: fine concentric rings + four thin spokes
    gy = fy + 0.003
    for i in range(9):
        rr = 0.035 + i * (0.0795 - 0.035) / 8
        parts.append(C.torus(f"fan_gr{i}", rr, 0.0007, (0, gy, 0), rot=(90, 0, 0), major=32, minor=3,
                             mat_=m["fan_grille"]))
    for i in range(4):
        a = 2 * math.pi * i / 4 + R(45)
        mid = (0.024 + r - 0.008) / 2
        parts.append(C.box(f"fan_spoke{i}", (r - 0.032, 0.0018, 0.0018),
                           (mid * math.cos(a), gy, mid * math.sin(a)),
                           rot=(0, -math.degrees(a), 0), bevel=0.0, mat_=m["fan_grille"]))
    # hub (photos): graphite rim around a round dark glass disc carrying the "100" readout,
    # a small round button below the digits
    parts.append(C.cyl("fan_cap", 0.030, 0.011, (0, fy + 0.0045, 0), rot=(90, 0, 0), segs=32,
                       mat_=m["fan"], bevel=0.0025))
    dw, dh = FAN_DISPLAY
    disc_front = fy - 0.001 - 0.0014                 # cap front (fy - 0.001) + 1.4 mm disc
    parts.append(C.cyl("fan_disc", 0.0245, 0.0016, (0, disc_front + 0.0008, 0), rot=(90, 0, 0), segs=32,
                       mat_=m["fan_dark"]))
    parts.append(C.cyl("fan_button", 0.0034, 0.0014, (0, disc_front - 0.0005, -0.0155), rot=(90, 0, 0),
                       segs=12, mat_=m["fan_grille"], bevel=0.0004))
    # U bracket: wide flat band from the pivots straight down, round corners, flat on the desk
    bz = -F["center_h"] + 0.0035
    ax = r + 0.012
    path = [(-ax, 0, 0.012), (-ax, 0, bz + 0.045), (-ax + 0.004, 0, bz + 0.016), (-ax + 0.016, 0, bz + 0.003),
            (-ax + 0.034, 0, bz), (ax - 0.034, 0, bz), (ax - 0.016, 0, bz + 0.003), (ax - 0.004, 0, bz + 0.016),
            (ax, 0, bz + 0.045), (ax, 0, 0.012)]
    parts.append(C.sweep("fan_bracket", C.catmull(path, 5), C.rect_profile(0.028, 0.007), m["fan"]))
    # flat base plate the U stands on (rounded rectangle in plan)
    pw, pd, pt = 2 * ax + 0.014, 0.078, 0.005
    pl = bmesh.new()
    ring_ = [pl.verts.new((x, y, -F["center_h"])) for x, y in rounded_rect(pw, pd, 0.02, 3)]
    top_ = [pl.verts.new((x, y, -F["center_h"] + pt)) for x, y in rounded_rect(pw, pd, 0.02, 3)]
    pl.faces.new(top_)
    for i in range(len(ring_)):
        j = (i + 1) % len(ring_)
        pl.faces.new((ring_[i], ring_[j], top_[j], top_[i]))
    bmesh.ops.recalc_face_normals(pl, faces=pl.faces)
    parts.append(obj_from_bm("fan_plate", pl, m["fan_rim"]))
    for sx in (-1, 1):
        parts.append(C.cyl(f"fan_arm{sx}", 0.018, 0.007, (sx * ax, 0, 0), rot=(0, 90, 0), segs=24,
                           mat_=m["fan"], bevel=0.0015))
        parts.append(C.cyl(f"fan_pivot{sx}", 0.012, 0.008, (sx * (ax + 0.0065), 0, 0), rot=(0, 90, 0),
                           segs=20, mat_=m["fan_rim"], bevel=0.002))
    for p in parts:
        xform(p, M)
        Rg(p, 1.3)

    # runtime: RGB ring on the bezel face (tinted like the monitor ring) + speed readout
    ring = obj_from_bm("fan_ring", bm_annulus_torus(r - 0.0052, 0.0026, 0.0011, fy - 0.0035, minor=4), m["fan_ring"])
    ring.matrix_world = M
    C.set_origin(ring, M @ Vector((0, fy - 0.0035, 0)))
    y_d = disc_front - 0.0004                        # 0.4 mm in front of the round display disc
    corners = [(-dw / 2, 0, -dh / 2), (dw / 2, 0, -dh / 2), (dw / 2, 0, dh / 2), (-dw / 2, 0, dh / 2)]
    disp = plane("fan_display", corners, m["screen"], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    disp.matrix_world = M @ Matrix.Translation((0, y_d, 0.003))

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
    return blades, ring, disp


def build_cat(m):
    """Faceted low-poly cat in the brand-mark language (diamond head, right-triangle
    ears, body split down the middle by a spine groove, wedge tail), posed like the
    owner's plush in the photos: a loaf lying left-right over the fan's round top,
    chest and front paws at the front edge (paws draping over the bezel), head
    raised at the laptop end and turned towards the laptop / viewer, tail wrapped
    round the hip and forward along the front edge.
    Parts are world-oriented (identity rotation); cat_head pivots at the neck,
    cat_tail at its base. ~0.17 m rump to chest along the arc.
    Frame below: fan-local, x = right (towards the laptop), y = back, z = up,
    origin on the housing top; the body follows the housing arc (angle phi from
    the top, + towards the laptop)."""
    F = D.FAN
    Ct = D.CAT
    rt = F["r"] + 0.001                               # housing top radius
    base = Vector((F["x"], F["y"], D.DESK_H + F["center_h"] + rt))
    Rot = C.euler((0, 0, F["yaw"])).to_3x3()

    def W(p):
        return base + Rot @ Vector(p)

    dy = Ct["y_shift"]

    def A(phi, y, h):
        """Point `h` above the housing surface at arc angle phi (deg), depth y (pass-2 frame:
        its drum was 7 cm deep; dy slides the cat forward onto the 10 cm drum's front edge)."""
        a = math.radians(phi + Ct["phi_shift"])
        rr = rt + h - 0.0025
        return Vector((rr * math.sin(a), y + dy, rr * math.cos(a) - rt))

    def tube(bm, pts, radii, n=6, cap0=True, tip=None):
        """Faceted tube through fan-local points; radii = [(r_side, r_up)] per point."""
        rings = []
        prev = None
        for i, c in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
            u = (prev if prev is not None else d.cross(ref)).copy()
            u = (u - d * u.dot(d)).normalized()
            v = d.cross(u).normalized()
            prev = u
            r1, r2 = radii[i]
            rings.append([bm.verts.new(W(c + u * (r1 * math.cos(2 * math.pi * k / n))
                                         + v * (r2 * math.sin(2 * math.pi * k / n)))) for k in range(n)])
        for i in range(len(rings) - 1):
            for k in range(n):
                bm.faces.new((rings[i][k], rings[i][(k + 1) % n], rings[i + 1][(k + 1) % n], rings[i + 1][k]))
        if cap0:
            bm.faces.new(list(reversed(rings[0])))
        if tip is not None:
            tv = bm.verts.new(W(tip))
            for k in range(n):
                bm.faces.new((rings[-1][k], rings[-1][(k + 1) % n], tv))
        else:
            bm.faces.new(rings[-1])
        return rings

    # body: 9-vertex loaf sections across the fan depth (belly on the housing, flanks,
    # a spine groove = the mark's body split down the middle)
    yo = -0.004
    bm = bmesh.new()
    rings = []
    for phi, w, t in ((-56, 0.022, 0.030), (-47, 0.035, 0.046), (-35, 0.043, 0.056), (-20, 0.045, 0.058),
                      (-4, 0.043, 0.055), (11, 0.040, 0.054), (23, 0.035, 0.053), (32, 0.027, 0.044)):
        sec = [(-0.84 * w, 0.0), (-w, 0.42 * t), (-0.74 * w, 0.84 * t), (-0.16 * w, t), (0.0, t - 0.0045),
               (0.16 * w, t), (0.74 * w, 0.84 * t), (w, 0.42 * t), (0.84 * w, 0.0)]
        rings.append([bm.verts.new(W(A(phi, yo + y, h))) for y, h in sec])
    n = 9
    for i in range(len(rings) - 1):
        for j in range(n):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]))
    rump = bm.verts.new(W(A(-63, yo, 0.016)))
    chest = bm.verts.new(W(A(38, yo - 0.004, 0.020)))
    for j in range(n):
        bm.faces.new((rings[0][(j + 1) % n], rings[0][j], rump))
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % n], chest))
    # front legs: from the chest over the front edge, draping down the bezel, paws at the end
    # pass 8: every limb starts with an extra root ring deep inside the loaf, so no piece of a
    # root ring / cap sits just under or through the flank (it baked as a dark speck)
    for phi in (27.0, 14.0):
        top = A(phi, -0.026, 0.016)
        pts = [A(phi, -0.010, 0.022), top, A(phi + 1, -0.042, 0.010), A(phi + 2, -0.049, -0.004),
               A(phi + 2, -0.051, -0.013)]
        tube(bm, [Vector(p) for p in pts], [(0.009, 0.010), (0.011, 0.012), (0.0105, 0.010), (0.010, 0.0095),
                                           (0.0115, 0.010)], n=6, tip=A(phi + 2.5, -0.057, -0.019))
    # hind leg: faceted haunch on the front flank at the hips, foot tucked in above the tail
    tube(bm, [A(-38, -0.010, 0.022), A(-37, -0.028, 0.027), A(-31, -0.039, 0.021)],
         [(0.013, 0.011), (0.016, 0.014), (0.011, 0.009)], n=6, tip=A(-25, -0.044, 0.018))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = obj_from_bm("cat_body", bm, m["cat"])
    C.set_origin(body, W((0.0, 0.0, 0.0)))
    tag(body, 2.2)

    # head: faceted diamond (the mark's head seen along the gaze) + ear prisms, raised at the
    # laptop end of the loaf and turned towards the laptop / viewer
    neck = A(21, yo - 0.002, 0.036)
    Hm = (Matrix.Translation(neck) @ C.euler((0, 0, -90.0 + Ct["head_yaw"]))
          @ C.euler((0, -Ct["head_tilt"], 0)))
    s = Ct["head_w"] / 122.0                       # the mark's head is 122 px wide
    hc = Vector((0.016, 0.0, 0.024))
    hw, ht, hb = 61 * s, 52 * s, 45 * s

    def WH(p):  # head frame: x = gaze, y = left, z = up
        return W(Hm @ (hc + Vector(p)))

    bm = bmesh.new()
    # outline octagon (L, TL, T, TR, R, BR, B, BL) at the widest plane, cheeks bulge a little
    oct_ = [(0, hw, 0), (-0.002, 0.56 * hw, 0.56 * ht), (-0.003, 0, ht), (-0.002, -0.56 * hw, 0.56 * ht),
            (0, -hw, 0), (0.003, -0.60 * hw, -0.52 * hb), (0.004, 0, -hb), (0.003, 0.60 * hw, -0.52 * hb)]
    ring0 = [bm.verts.new(WH(p)) for p in oct_]
    face = [bm.verts.new(WH((0.012 + 0.002 * (p[2] < 0), 0.52 * p[1], 0.52 * p[2] - 0.002))) for p in oct_]
    nose = bm.verts.new(WH((0.020, 0.0, -0.007)))
    back = [bm.verts.new(WH((-0.012, 0.55 * p[1], 0.55 * p[2] + 0.002))) for p in oct_]
    kp = bm.verts.new(WH((-0.018, 0.0, 0.003)))
    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new((ring0[i], ring0[j], face[j], face[i]))
        bm.faces.new((face[i], face[j], nose))
        bm.faces.new((ring0[j], ring0[i], back[i], back[j]))
        bm.faces.new((back[j], back[i], kp))
    gap = 2 * s
    for sgn in (1, -1):
        # mark ear (px rel. head centre): vertical outer edge, hypotenuse parallel to the head edge
        tri = [(sgn * 61 * s, 62 * s - gap), (sgn * 59 * s, 17 * s - gap), (sgn * 31 * s, 40 * s - gap)]
        front = [bm.verts.new(WH((0.002, yy, zz))) for yy, zz in tri]
        back_ = [bm.verts.new(WH((-0.007, yy * 0.94, zz - 0.003))) for yy, zz in tri]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back_)))
        for i in range(3):
            bm.faces.new((front[i], back_[i], back_[(i + 1) % 3], front[(i + 1) % 3]))
    # pass 6: no neck tube - the head's lower half already sits inside the loaf's front (the
    # pass-2 look). The pivot moves from the old neck point into the head's lower back, so the
    # runtime gaze turns the head in place instead of swinging it through the body.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    head = obj_from_bm("cat_head", bm, m["cat"])
    pivot = W(Hm @ (hc + Vector(Ct["pivot"])))
    C.set_origin(head, pivot)
    tag(head, 2.4)

    # tail: from the rump round the hip and forward along the front edge of the housing top,
    # under the hind leg towards the front paws (the loaf's wrapped tail; faces the camera)
    tpath = [A(-57, yo + 0.004, 0.020), A(-64, -0.012, 0.015), A(-63, -0.032, 0.011), A(-54, -0.046, 0.008),
             A(-42, -0.052, 0.006), A(-30, -0.054, 0.005), A(-19, -0.054, 0.006)]
    radii = [(0.0105, 0.0095), (0.0098, 0.0088), (0.0092, 0.0082), (0.0086, 0.0077), (0.008, 0.0072),
             (0.0072, 0.0065), (0.0062, 0.0056)]
    bm = bmesh.new()
    tube(bm, tpath, radii, n=6, tip=A(-11, -0.052, 0.008))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tail = obj_from_bm("cat_tail", bm, m["cat"])
    C.set_origin(tail, W(tpath[0]))
    tag(tail, 1.6)
    head_fwd = Rot @ (Hm.to_3x3() @ Vector((1, 0, 0)))
    return body, head, tail, head_fwd


# ------------------------------------------------------------------ server + room
# ------------------------------------------------------------------ server + room
# ------------------------------------------------------------------ server + room

# ------------------------------------------------------------------ pass 9 props

def bm_lathe_oval(layers, ry, rz, segs=20):
    """Closed oval solid along +X: layers [(x, scale)] of the (ry, rz) oval, capped by fans."""
    bm = bmesh.new()
    rings = []
    for x, k in layers:
        rings.append([bm.verts.new((x, ry * k * math.cos(2 * math.pi * i / segs),
                                    rz * k * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    for ring, x in ((rings[0], layers[0][0]), (rings[-1], layers[-1][0])):
        c = bm.verts.new((x, 0, 0))
        for i in range(segs):
            bm.faces.new((ring[i], ring[(i + 1) % segs], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_headphones(m):
    """QCY H3S, light warm grey matte (photos headphones/1-6): a wide flat band with a padded
    underside, sliders out of the band ends, big rounded-oval cups with thick cushions. Modelled
    as worn (cups facing each other along X, band arc in the XZ plane), then laid down."""
    H = D.HEADPHONES
    Rb, bw, bt = H["band_r"], H["band_w"], H["band_t"]
    ry, rz = H["cup"]
    s0, s1 = H["shell"]
    c0, c1 = H["cushion"]
    cz = -0.072                                          # cup centres (band centre at 0)
    parts = []
    arc = [(Rb * math.cos(R(a)), 0.0, Rb * math.sin(R(a))) for a in range(-14, 195, 12)]
    parts.append(C.sweep("hp_band", arc, rounded_rect(bt, bw, 0.004, seg=1), mat_=m["hp"], up=(0, 1, 0)))
    pad = [((Rb - bt / 2 - 0.004) * math.cos(R(a)), 0.0, (Rb - bt / 2 - 0.004) * math.sin(R(a)))
           for a in range(28, 153, 14)]
    parts.append(C.sweep("hp_pad", pad, rounded_rect(0.009, bw - 0.006, 0.004, seg=1), mat_=m["hp_soft"],
                         up=(0, 1, 0)))
    for sx in (-1, 1):
        # slider: from the band end straight down to the top of the cup's outer shell
        top = Vector((sx * Rb * math.cos(R(14)), 0.0, -Rb * math.sin(R(14))))
        bot = Vector((sx * (s0 + s1) / 2, 0.0, cz + rz * 0.55))
        parts.append(C.sweep(f"hp_slider{sx}", [top + Vector((0, 0, 0.008)), bot],
                             rounded_rect(0.008, 0.020, 0.003, seg=1), mat_=m["hp"], up=(0, 1, 0)))
        # cup shell: flat outer plate with a rounded rim, a little narrower at the plate
        shell = bm_lathe_oval([(s0, 1.0), (s0 + 0.55 * (s1 - s0), 1.0), (s1 - 0.004, 0.93), (s1, 0.80)],
                              ry, rz, 16)
        cush = bm_lathe_oval([(c0, 0.84), (c0 + 0.005, 0.97), ((c0 + c1) / 2, 1.02), (c1, 1.0)],
                             ry * 0.97, rz * 0.97, 16)
        for bm_, nm, mt in ((shell, "hp_cup", m["hp"]), (cush, "hp_cush", m["hp_soft"])):
            if sx < 0:
                bmesh.ops.scale(bm_, vec=(-1, 1, 1), verts=bm_.verts)
                bmesh.ops.reverse_faces(bm_, faces=bm_.faces)
            bmesh.ops.translate(bm_, vec=(0, 0, cz), verts=bm_.verts)
            parts.append(obj_from_bm(f"{nm}{sx}", bm_, mt))
    M = rest_pose(parts, Vector(H["up"]), H["yaw"], (H["x"], H["y"], D.DESK_H))
    for p in parts:
        xform(p, M)
        Rg(p, 1.1)
    return parts


def rest_pose(parts, up_want, yaw, at):
    """How a rigid object lies when set down: it rests on a face of its convex hull whose
    support polygon contains the centre of mass. Of those stable faces, take the one whose
    'up' is closest to `up_want` (object frame); yaw it about the vertical and put the face
    on the plane at `at` (x, y = centre of the footprint, z = the surface). Several hull
    vertices end up exactly on the surface: real contacts, no hover, no intersection."""
    pts = [p.matrix_world @ v.co for p in parts for v in p.data.vertices]
    com = sum(pts, Vector()) / len(pts)
    bm = bmesh.new()
    for q in pts:
        bm.verts.new(q)
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    bm.normal_update()
    hc = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
    up_want = up_want.normalized()
    best = None
    for f in bm.faces:
        n = f.normal.copy()
        if n.dot(f.calc_center_median() - hc) < 0:
            n.negate()
        # centre of mass dropped along n onto the face plane: inside the support polygon?
        d = (com - f.verts[0].co).dot(n)
        c = com - n * d
        coplanar = [g for g in bm.faces if abs(abs(g.normal.dot(n)) - 1) < 1e-4
                    and abs((g.verts[0].co - f.verts[0].co).dot(n)) < 1e-5]
        inside = any(all(((g.verts[(i + 1) % len(g.verts)].co - g.verts[i].co).cross(c - g.verts[i].co)).dot(n)
                         >= -1e-9 for i in range(len(g.verts)))
                     or all(((g.verts[(i + 1) % len(g.verts)].co - g.verts[i].co).cross(c - g.verts[i].co)).dot(n)
                            <= 1e-9 for i in range(len(g.verts))) for g in coplanar)
        if not inside:
            continue
        score = (-n).dot(up_want)
        if best is None or score > best[0]:
            best = (score, n.copy())
    bm.free()
    Rq = (-best[1]).rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    Rz = Matrix.Rotation(R(yaw), 4, "Z")
    placed = [Rz @ Rq @ q for q in pts]
    zmin = min(q.z for q in placed)
    cx = (min(q.x for q in placed) + max(q.x for q in placed)) / 2
    cy = (min(q.y for q in placed) + max(q.y for q in placed)) / 2
    print(f"[build] rest pose: up {tuple(round(x, 3) for x in -best[1])} (wanted {tuple(round(x, 2) for x in up_want)}),"
          f" {sum(1 for q in placed if q.z - zmin < 1e-4)} vertices on the surface")
    return Matrix.Translation((at[0] - cx, at[1] - cy, at[2] - zmin)) @ Rz @ Rq


def shark_material(name, ref):
    """sharkslides gradient: blue toe / top -> pale yellow-green -> teal heel (baked albedo),
    along the slide's own axis (`ref` empty: origin mid-sole, -Y = toe)."""
    mm = bpy.data.materials.new(name)
    nt, bsdf, _ = C._principled(mm)
    bsdf.inputs["Roughness"].default_value = 0.7
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.object = ref
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    L = D.SLIDES["size"][1]
    # t: 0 at the toe, 1 at the heel, pushed on (towards the pale middle) higher up the head
    mad = nt.nodes.new("ShaderNodeMath"); mad.operation = "MULTIPLY_ADD"
    mad.inputs[1].default_value = 1.0 / L
    mad.inputs[2].default_value = 0.5
    nt.links.new(sep.outputs["Y"], mad.inputs[0])
    up = nt.nodes.new("ShaderNodeMath"); up.operation = "MULTIPLY_ADD"
    up.inputs[1].default_value = 2.4
    nt.links.new(sep.outputs["Z"], up.inputs[0])
    nt.links.new(mad.outputs[0], up.inputs[2])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].position, cr.elements[0].color = 0.10, C.hex_lin("#7aa7e6")
    cr.elements[1].position, cr.elements[1].color = 0.92, C.hex_lin("#29ab9e")
    e = cr.elements.new(0.24); e.color = C.hex_lin("#93b6e2")
    e = cr.elements.new(0.40); e.color = C.hex_lin("#dde8a2")
    e = cr.elements.new(0.60); e.color = C.hex_lin("#c3e3a4")
    e = cr.elements.new(0.80); e.color = C.hex_lin("#52bfa6")
    nt.links.new(up.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return mm


def slide_half_width(W, L, y):
    """Half-width of the sole outline at y (toe at -L/2): rounder, wider toe, narrower waist."""
    t = (y + L / 2) / L                              # 0 toe .. 1 heel
    w = W / 2 * (1.0 - 0.16 * math.exp(-((t - 0.62) / 0.16) ** 2) - 0.08 * t)
    return w * math.sqrt(max(0.0, 1.0 - (2.0 * y / L) ** 2))


def slide_outline(W, L, n=22):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        y = -0.5 * L * math.cos(a)
        pts.append((math.copysign(slide_half_width(W, L, y), math.sin(a)) if abs(math.sin(a)) > 1e-9 else 0.0, y))
    return pts


def bm_prism(outline, z0, z1):
    """Closed prism over a 2D (x, y) outline, z0..z1 (consistent outward normals)."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((x, y, z1)) for x, y in outline]
    bm.faces.new(lo)
    bm.faces.new(hi)
    n = len(outline)
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


SLIDE_SOLE_H = 0.024        # foam sole (top = insole)
# pass 11 (owner: "they are more cute in real life"): a puffy, rounded, chubby head - rounder
# sections (p 2.2), more of them, smooth shaded - a big smile round the toe
SLIDE_HEAD = dict(y0=-0.47, y1=0.03, top=0.050, toe=0.026, jaw=0.012, p=2.2, n=9, arc=14)


def slide_head_shape(W, L, y):
    """(half-width, height above the sole, lip z) of the head section at y."""
    Hd = SLIDE_HEAD
    y0, y1 = Hd["y0"] * L, Hd["y1"] * L
    u = (y - y0) / (y1 - y0)                          # 0 toe .. 1 back edge of the head
    hz = Hd["toe"] + (Hd["top"] - Hd["toe"]) * math.sin(0.5 * math.pi * min(1.0, u / 0.7))
    lip = Hd["jaw"] * (1.0 - smooth01((u - 0.10) / 0.18))  # the mouth: head raised off the sole at the toe
    return slide_half_width(W, L, y) * 0.985, hz, lip


def smooth01(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def build_slides(m):
    """sharkslides (photos sharks/1-4), real size (~28 x 11 cm, EU 42-43): a foam sole, a low
    closed shark head lofted over the front half (flat-topped superellipse sections, lowest at
    the toe) whose front lip stands off the sole - the mouth, with a row of white teeth above
    and below - eyes on the flanks, a short thick rounded dorsal fin, side pectoral fins near
    the front, an open heel with a pale insole and a small forked tail at the heel."""
    W, L = D.SLIDES["size"]
    Hd = SLIDE_HEAD
    h = SLIDE_SOLE_H
    helpers = C.coll("helpers")
    out = []
    for k, (x, y, yaw) in enumerate(D.SLIDES["pair"]):
        M = M_at((x, y, 0.0), yaw=yaw)
        ref = bpy.data.objects.new(f"slide_ref{k}", None)
        helpers.objects.link(ref)
        ref.matrix_world = M
        body = shark_material(f"shark{k}", ref)
        parts = []
        # sole: thick soft foam - a rounded rim (lofted rings), bottom dropped, the top inset is
        # the insole (pale)
        bm = bmesh.new()
        outline = slide_outline(W, L, 26)
        rings_ = [[bm.verts.new((px * k, py * (1 - (1 - k) * 0.5), z)) for px, py in outline]
                  for z, k in ((0.0, 0.95), (0.006, 0.995), (h - 0.008, 1.0), (h - 0.002, 0.975), (h, 0.935))]
        n = len(outline)
        for ra, rb in zip(rings_, rings_[1:]):
            for i in range(n):
                bm.faces.new((ra[i], ra[(i + 1) % n], rb[(i + 1) % n], rb[i]))
        bm.faces.new(rings_[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        sole = obj_from_bm(f"slide_sole{k}", bm, body)
        sole.data.materials.append(m["insole"])
        faces_material(sole, lambda c, nn: 1 if nn.z > 0.9 else 0)
        smooth(sole, 50.0)
        parts.append(sole)
        # head: lofted superellipse sections from the toe to the back edge of the strap
        bm = bmesh.new()
        ys = [L * (Hd["y0"] + (Hd["y1"] - Hd["y0"]) * i / (Hd["n"] - 1)) for i in range(Hd["n"])]
        rings = []
        for yy in ys:
            w, hz, lip = slide_head_shape(W, L, yy)
            ring = []
            for j in range(Hd["arc"] + 1):
                th = math.pi * j / Hd["arc"]
                c, s_ = math.cos(th), math.sin(th)
                ex = abs(c) ** (2.0 / Hd["p"]) * math.copysign(1.0, c)
                ez = s_ ** (2.0 / Hd["p"])
                ring.append(bm.verts.new((w * ex, yy, h - 0.002 + lip + (hz - lip) * ez)))
            rings.append(ring)
        for ra, rb in zip(rings, rings[1:]):
            for j in range(Hd["arc"]):
                bm.faces.new((ra[j], rb[j], rb[j + 1], ra[j + 1]))
        bm.faces.new(rings[0])                          # the head's front (upper jaw)
        back = bm.faces.new(list(reversed(rings[-1])))  # the foot opening (insole colour)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            f.material_index = 1 if f is back else 0
        hd = obj_from_bm(f"slide_head{k}", bm, body)
        hd.data.materials.append(m["insole"])
        smooth(hd, 50.0)
        parts.append(hd)
        # teeth: white wedges along the mouth, where the head's lip stands off the sole - the
        # upper row hangs from the lip, the lower row stands on the sole's edge
        mouth = []
        for i in range(60):
            yy = L * (Hd["y0"] + 0.30 * i / 59)
            w, hz, lip = slide_head_shape(W, L, yy)
            if lip > 0.55 * Hd["jaw"]:
                mouth.append((w, yy))
        pts, acc, last = [], 0.0, None
        ymax = mouth[-1][1]
        for sx in (-1, 1):                                 # along one flank, round the front, the other
            for w, yy in (reversed(mouth) if sx < 0 else mouth):
                pts.append((sx * w, yy))
        pts = [p_ for i, p_ in enumerate(pts) if i == 0 or p_ != pts[i - 1]]
        L_arc = sum(math.dist(p0, p1) for p0, p1 in zip(pts, pts[1:]))
        nt_ = 6
        for j in range(nt_):
            d = (j + 0.5) / nt_ * L_arc
            for p0, p1 in zip(pts, pts[1:]):
                seg = math.dist(p0, p1)
                if d <= seg:
                    q = (p0[0] + (p1[0] - p0[0]) * d / seg, p0[1] + (p1[1] - p0[1]) * d / seg)
                    ang = math.atan2(p1[0] - p0[0], -(p1[1] - p0[1]))
                    break
                d -= seg
            lip = slide_head_shape(W, L, q[1])[2]
            for zc, flip in ((h - 0.002 + lip - 0.0035, -1), (h + 0.0025, 1)):
                tb = C.bm_cyl(0.0052, 0.0058, 5, r2=0.0017, caps=False)   # small, soft, blunt
                if flip < 0:
                    bmesh.ops.rotate(tb, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, "X"), verts=tb.verts)
                C._xf(tb, (q[0] * 0.93, q[1] + 0.002, zc), (0, 0, math.degrees(ang)))
                to = obj_from_bm(f"slide_tooth{k}{j}{flip}", tb, m["teeth"])
                smooth(to, 80.0)
                parts.append(to)
        # eyes: small dark studs on the head's flanks, facing out
        ey = L * (Hd["y0"] + 0.10)
        w, hz, lip = slide_head_shape(W, L, ey)
        ez = 0.55
        ex = w * (1.0 - ez ** Hd["p"]) ** (1.0 / Hd["p"])
        for sx in (-1, 1):
            eb = hemi(0.0066, 0.0066, 0.0038, segs=8, rings=3)
            bmesh.ops.rotate(eb, cent=(0, 0, 0), matrix=Matrix.Rotation(R(90), 3, "Y") if sx > 0
                             else Matrix.Rotation(R(-90), 3, "Y"), verts=eb.verts)
            bmesh.ops.rotate(eb, cent=(0, 0, 0), matrix=Matrix.Rotation(R(sx * 42), 3, "Z"), verts=eb.verts)
            bmesh.ops.translate(eb, vec=(sx * (ex - 0.0012), ey, h + lip + (hz - lip) * ez), verts=eb.verts)
            eo = obj_from_bm(f"slide_eye{k}{sx}", eb, m["shark_eye"])
            smooth(eo, 80.0)
            parts.append(eo)
        # dorsal fin: a short, thick, rounded cone on the head, leaning back (closed mesh)
        fy = L * (Hd["y0"] + 0.28)
        w, hz, lip = slide_head_shape(W, L, fy)
        fin = bmesh.new()
        segs, fh = 8, 0.018      # short and stubby
        frings = []
        for i, (t, rx, ry) in enumerate(((0.0, 0.0095, 0.016), (0.45, 0.0090, 0.0145), (0.78, 0.0072, 0.0105),
                                        (0.95, 0.0045, 0.0062))):
            zz = -0.006 + (fh + 0.006) * t
            lean = 0.006 * t * t
            frings.append([fin.verts.new((rx * math.cos(2 * math.pi * q / segs), lean + ry * math.sin(2 * math.pi * q / segs), zz))
                           for q in range(segs)])
        for ra, rb in zip(frings, frings[1:]):
            for q in range(segs):
                fin.faces.new((ra[q], ra[(q + 1) % segs], rb[(q + 1) % segs], rb[q]))
        tipv = fin.verts.new((0, 0.0062, fh))
        for q in range(segs):
            fin.faces.new((frings[-1][q], frings[-1][(q + 1) % segs], tipv))
        fin.faces.new(list(reversed(frings[0])))
        bmesh.ops.recalc_face_normals(fin, faces=fin.faces)
        bmesh.ops.translate(fin, vec=(0, fy, h - 0.002 + hz), verts=fin.verts)
        fo = obj_from_bm(f"slide_fin{k}", fin, m["shark_fin"])
        smooth(fo, 60.0)
        parts.append(fo)
        # pectoral fins: thick swept-back wedges sticking out of the head's sides near the front
        py0 = L * (Hd["y0"] + 0.30)
        for sx in (-1, 1):
            wy = slide_half_width(W, L, py0)
            lobe = [(0.0, -0.011)] + [(0.013 * math.sin(R(t)) + 0.004, 0.004 - 0.012 * math.cos(R(t)) + 0.008 * t / 180)
                                      for t in range(30, 181, 30)] + [(0.0, 0.012)]
            if sx < 0:
                lobe = [(-px, py) for px, py in reversed(lobe)]
            pf = bm_prism(lobe, 0.0, 0.007)
            bmesh.ops.translate(pf, vec=(sx * (wy - 0.005), py0, h + 0.002), verts=pf.verts)
            po = obj_from_bm(f"slide_pfin{k}{sx}", pf, body)
            smooth(po, 60.0)
            parts.append(po)
        # forked tail at the heel
        tail = bm_prism([(-0.009, 0.0), (0.009, 0.0), (0.015, 0.020), (0.0, 0.011), (-0.015, 0.020)], 0.004, 0.019)
        bmesh.ops.translate(tail, vec=(0, L * 0.47, 0.0), verts=tail.verts)
        parts.append(obj_from_bm(f"slide_tail{k}", tail, body))
        for p in parts:
            xform(p, M)
            S(p, 2.0 if "fin" in p.name or "tail" in p.name or "eye" in p.name else 0.9, room=True)
        out += parts
    return out



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


def grid_plane(name, us, vs, to3, mat_, du, dv, holes=()):
    """Axis-aligned plane split at the given cuts, as ONE connected mesh with a continuous
    UV layout (pass 8). Per-cell texel weights used to give every cell its own atlas island
    at its own density: the bake / denoise then differed per island and showed as lines
    and brightness steps along the cuts. Now u -> U(u), v -> V(v) are piecewise-linear
    (density du[i] per u-interval, dv[j] per v-interval: more texels near the desk), stored
    in the `uvfix` corner attribute; bake.py lays the island out from it instead of
    smart-projecting, so the whole wall / floor is one seamless island."""
    def cum(cuts, dens):
        out = [0.0]
        for i in range(len(cuts) - 1):
            out.append(out[-1] + (cuts[i + 1] - cuts[i]) * dens[i])
        return out
    U, V = cum(us, du), cum(vs, dv)
    bm = bmesh.new()
    grid = [[bm.verts.new(to3(u, v)) for v in vs] for u in us]
    faces = []
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            if (i, j) in holes:
                continue
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
            nv = len(vs)
            faces.append({i * nv + j: (U[i], V[j]), (i + 1) * nv + j: (U[i + 1], V[j]),
                          (i + 1) * nv + j + 1: (U[i + 1], V[j + 1]), i * nv + j + 1: (U[i], V[j + 1])})
    ob = obj_from_bm(name, bm, mat_)
    me = ob.data
    a = me.attributes.new("uvfix", "FLOAT2", "CORNER")
    lv = {}
    for fi, uvs in enumerate(faces):
        for vi, uv in uvs.items():
            lv[(fi, vi)] = uv
    for poly in me.polygons:
        for li in poly.loop_indices:
            a.data[li].vector = lv[(poly.index, me.loops[li].vertex_index)]
    fx = me.attributes.new("fixuv", "FLOAT", "FACE")
    fx.data.foreach_set("value", [1.0] * len(me.polygons))
    S(ob, 1.0, room=True)
    return ob


# desk shadow decals (runtime multiply, white = no change). The room (`static`) is baked
# without the rig's shadows; these quads carry the darkening the rig casts at preset 1, so the
# floor one can be scaled/faded and the wall one rides up with the desk.
# pass 9: the wall quad stands just in front of the skirting (1.75 cm off the wall), so it
# also covers the skirting's face and top: no unshadowed strip at the wall / floor join. It
# reaches 0.5 m BELOW the floor (hidden under it at preset 1): raised, the desk's wall shadow
# moves up by dh and that hidden strip (the shadow continued straight down) slides into view,
# so the leg shadow still reaches the floor. The floor quad ends under the skirting. `ramp`
# (a0, a1, b0, b1): which borders fade to white; no fade where the two quads meet (floor back
# edge, wall bottom edge), and every fading border lies where the desk casts nothing.
SHADOW_FLOOR = dict(x=(D.LEFT_X + 0.016, 1.50), y=(-0.95, D.WALL_Y - 0.004), z=0.0015, ramp=(1, 1, 1, 0))
SHADOW_WALL = dict(x=(D.LEFT_X + 0.0005, 1.50), z=(-0.50, 1.95), y=D.WALL_Y - 0.0175, ramp=(1, 1, 0, 1))


def build_shadow_decals(m):
    F, Wl = SHADOW_FLOOR, SHADOW_WALL
    (x0, x1), (y0, y1), z = F["x"], F["y"], F["z"]
    fl = plane("shadow_floor", [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], m["shadow"])
    fl["decal_rect"] = [x0, x1, y0, y1]
    fl["decal_axes"] = "xy"
    fl["decal_ramp"] = list(F["ramp"])
    (x0, x1), (z0, z1), y = Wl["x"], Wl["z"], Wl["y"]
    wl = plane("shadow_wall", [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], m["shadow"])
    wl["decal_rect"] = [x0, x1, z0, z1]
    wl["decal_axes"] = "xz"
    wl["decal_ramp"] = list(Wl["ramp"])
    for ob, grp in ((fl, 0.5), (wl, 0.75)):
        C.set_origin(ob, tuple(sum((ob.matrix_world @ v.co for v in ob.data.vertices), Vector()) / 4))
        tag(ob, 0.24, room=True)
        ob["bake"] = True
        ob["shadow_decal"] = grp
        # invisible to every ray: they must not occlude or bounce light in the bake
        for a in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter",
                  "visible_shadow"):
            setattr(ob, a, False)
    return fl, wl


def build_room(m):
    W0, W1 = D.LEFT_X, D.LEFT_X + D.FLOOR[0]
    Y0, Y1 = D.WALL_Y - D.FLOOR[1], D.WALL_Y
    Hh = D.ROOM_H
    # big surfaces are split so the texels go where the camera looks (the far
    # parts fade into the page background anyway)
    # densest under / behind the desk (contact shadows of the feet, the desk's wall shadow)
    grid_plane("floor", (W0, -1.0, -0.75, 0.75, 1.55, W1), (Y0, -1.35, -0.55, Y1), lambda u, v: (u, v, 0.0),
               m["floor"], du=(0.07, 0.30, 0.45, 0.30, 0.07), dv=(0.07, 0.30, 0.45))
    grid_plane("wall_back", (W0, -0.95, -0.75, 0.75, 1.35, W1), (0.0, 1.1, 1.9, Hh), lambda u, v: (u, Y1, v),
               m["wall"], du=(0.08, 0.32, 0.42, 0.32, 0.08), dv=(0.42, 0.32, 0.08))
    Wn = D.WINDOW
    wy0, wy1 = Wn["y"] - Wn["w"] / 2, Wn["y"] + Wn["w"] / 2
    wz0, wz1 = Wn["sill"], Wn["sill"] + Wn["h"]
    x = W0
    # left wall: one mesh around the window opening (the hole is cell (2, 1))
    grid_plane("wall_left", (Y0, wy0 - 0.6, wy0, wy1, Y1), (0.0, wz0, wz1, Hh), lambda u, v: (x, u, v),
               m["wall"], du=(0.05, 0.14, 0.14, 0.14), dv=(0.14, 0.14, 0.11), holes={(2, 1)})
    dep = Wn["depth"]
    # reveals of the opening
    # reveals face into the opening (point order sets the normal)
    for nm, pts in (("rev_l", [(x, wy0, wz0), (x, wy0, wz1), (x - dep, wy0, wz1), (x - dep, wy0, wz0)]),
                    ("rev_r", [(x, wy1, wz0), (x - dep, wy1, wz0), (x - dep, wy1, wz1), (x, wy1, wz1)]),
                    ("rev_t", [(x, wy0, wz1), (x, wy1, wz1), (x - dep, wy1, wz1), (x - dep, wy0, wz1)])):
        S(plane(nm, list(reversed(pts)), m["wall"]), 0.12, room=True)
    # window (pass 8): a closed low-poly PVC window in the reveal - a continuous outer frame
    # on all four sides, two sashes with their own frames meeting at a full-height mullion
    # (head to sill frame), a transom bar spanning the left sash from its frame to the
    # mullion, and a sill board under the frame with a small overhang into the room. Every
    # member overlaps its neighbours (closed joints). room=0.5: the edge fade is halved on
    # the window so the frame keeps reading against the wall when seen up close.
    fx = x - dep * 0.6
    ft, fd = 0.06, 0.07                                  # outer frame: face width, depth (along x)
    st, sd, sx_ = 0.045, 0.06, 0.008                     # sash frame: width, depth, offset into the room
    ym = Wn["y"] + 0.05                                  # mullion centre
    mw = 0.07
    parts = []

    def bx(nm, xr, yr, zr, bevel=0.003):
        (x0, x1), (y0, y1), (z0, z1) = xr, yr, zr
        parts.append(C.box(nm, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                           bevel=bevel, mat_=m["pvc"]))

    fxr = (fx - fd / 2, fx + fd / 2)
    bx("wf_b", fxr, (wy0, wy1), (wz0, wz0 + ft))
    bx("wf_t", fxr, (wy0, wy1), (wz1 - ft, wz1))
    bx("wf_l", fxr, (wy0, wy0 + ft), (wz0, wz1))
    bx("wf_r", fxr, (wy1 - ft, wy1), (wz0, wz1))
    bx("wf_m", (fx - fd / 2, fx + fd / 2 + 0.004), (ym - mw / 2, ym + mw / 2), (wz0, wz1))
    sxr = (fx - sd / 2 + sx_, fx + sd / 2 + sx_)
    za, zb = wz0 + ft - 0.004, wz1 - ft + 0.004
    for side, (ya, yb) in (("l", (wy0 + ft - 0.004, ym - mw / 2 + 0.004)), ("r", (ym + mw / 2 - 0.004, wy1 - ft + 0.004))):
        bx(f"ws{side}_b", sxr, (ya, yb), (za, za + st))
        bx(f"ws{side}_t", sxr, (ya, yb), (zb - st, zb))
        bx(f"ws{side}_l", sxr, (ya, ya + st), (za, zb))
        bx(f"ws{side}_r", sxr, (yb - st, yb), (za, zb))
    bx("ws_bar", (sxr[0] + 0.006, sxr[1] - 0.006), (wy0 + ft - 0.004, ym - mw / 2 + 0.004),
       (wz0 + 0.42 - 0.02, wz0 + 0.42 + 0.02))
    # sill board: under the frame (top flush with the frame bottom), 4 cm overhang into the room
    parts.append(C.box("sill", (x + 0.04 - (fx - fd / 2), Wn["w"] + 0.10, 0.028),
                       ((x + 0.04 + fx - fd / 2) / 2, Wn["y"], wz0 - 0.014), bevel=0.003, mat_=m["pvc"]))
    for p in parts:
        S(p, 0.4, room=0.5)
    sky = plane("window_sky", [(fx - 0.04, wy0, wz0), (fx - 0.04, wy1, wz0), (fx - 0.04, wy1, wz1),
                               (fx - 0.04, wy0, wz1)], m["sky"], uvs=[(0, 1), (1, 1), (1, 0), (0, 0)])
    C.set_origin(sky, (fx - 0.04, Wn["y"], (wz0 + wz1) / 2))
    # radiator under the window
    rx = x + 0.055
    for i in range(10):
        yy = Wn["y"] - 0.34 + i * 0.075
        S(C.box(f"rad{i}", (0.07, 0.05, 0.5), (rx, yy, 0.40), bevel=0.012, segs=1, mat_=m["white"]), 0.35,
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
    led_paddle, hit_paddle, paddle_glyphs = build_paddle(m)
    scr_l, hit_l, lap_glow = build_laptop(m)
    build_laptop_stand(m)
    scr_m, hit_m, ring, glow = build_monitor(m)
    led_kbd, _kbd_M, kbd_glow, kbd_accent = build_keyboard(m)
    build_pad(m)
    build_mouse(m)
    build_gamepad(m)
    blades, fan_ring, fan_disp = build_fan(m)
    cat_body, cat_head, cat_tail, head_fwd = build_cat(m)
    # clean desk (owner): no charger, no cables on or under the desk, no cable_drop
    leds_srv = build_server(m)
    build_headphones(m)
    build_slides(m)
    sky = build_room(m)
    shadow_floor, shadow_wall = build_shadow_decals(m)

    # merge the baked groups
    static = C.join(PARTS_STATIC, "static")
    C.set_origin(static, (0, 0, 0))
    C.link(static, bake_static)
    desk_baked = C.join(PARTS_RIG, "desk_baked")
    C.set_origin(desk_baked, (0, 0, D.DESK_H))
    C.link(desk_baked, bake_rig)
    C.parent_keep(desk_baked, rig)
    # the runtime-tinted baked parts (R86): own nodes under the rig, same atlas
    for ob in (kbd_accent, paddle_glyphs):
        C.set_origin(ob, (0, 0, D.DESK_H))
        C.link(ob, bake_rig)
        C.parent_keep(ob, rig)

    for ob in [scr_l, scr_m, hit_l, hit_m, ring, glow, led_paddle, led_kbd, blades, cat_body,
               fan_ring, fan_disp, kbd_glow, lap_glow] + hit_paddle:
        C.link(ob, runtime)
        C.parent_keep(ob, rig)
    for ob in (cat_head, cat_tail):
        C.link(ob, runtime)
        C.parent_keep(ob, cat_body)
    for ob in [sky, shadow_floor] + leds_srv:
        C.link(ob, runtime)
    C.link(shadow_wall, runtime)
    C.parent_keep(shadow_wall, rig)
    ref = bpy.data.objects.get("laptop_ref")
    if ref:
        C.link(ref, helpers)

    # bake membership + runtime-only flags
    for ob in (static, desk_baked, kbd_accent, paddle_glyphs, blades, cat_body, cat_head, cat_tail):
        ob["bake"] = True
    # not in the bake (no occlusion, no light): runtime-only emissive overlays
    for ob in [sky, glow, hit_l, hit_m, fan_ring, fan_disp, kbd_glow, lap_glow] + hit_paddle:
        ob.hide_render = True
    for ob in (fan_ring, fan_disp, kbd_glow, lap_glow):
        ob["runtime_overlay"] = True
    for ob in [hit_l, hit_m] + hit_paddle:
        ob.display_type = "WIRE"
        ob["hit"] = True
    blades["pivot_at"] = "hub"
    blades["spin_axis_gltf_local"] = "Z"
    cat_head["pivot_at"] = "neck"
    cat_tail["pivot_at"] = "tail_base"
    rig["pivot_at"] = "desk_top"
    cat_head["forward"] = list(head_fwd)

    for ob in (static, desk_baked, kbd_accent, paddle_glyphs, blades, ring, scr_m):
        smooth(ob)
    build_rigs()
    camera("cam_desk", D.CAM_DESK, parent=rig)
    if "debugcams" in a:
        dbg = C.coll("helpers")
        cx, cy, cz = D.FAN["x"], D.FAN["y"], D.DESK_H + D.FAN["center_h"] + D.FAN["r"] + 0.075
        for nm, spec in (("dbg_cat", dict(loc=(cx + 0.12, cy - 0.55, cz + 0.08), target=(cx, cy, cz), hfov=30, aspect=1.6)),
                         ("dbg_cat3q", dict(loc=(cx + 0.42, cy - 0.40, cz + 0.10), target=(cx, cy, cz), hfov=30, aspect=1.6)),
                         ("dbg_catside", dict(loc=(cx + 0.58, cy + 0.02, cz + 0.02), target=(cx, cy, cz), hfov=30, aspect=1.6)),
                         ("dbg_lapkbd", dict(loc=tuple(laptop_matrix() @ Vector((0, 0.035, 0.50))),
                                             target=tuple(laptop_matrix() @ Vector((0, 0.035, 0.025))), hfov=42, aspect=1.6)),
                         ("dbg_top", dict(loc=(0.0, -0.02, 9.0), target=(0.0, 0.0, 0.74), hfov=11.5, aspect=1.6)),
                         ("dbg_low", dict(loc=(-0.30, -0.85, 0.90), target=(-0.20, 0.10, 0.92), hfov=62, aspect=1.6)),
                         ("dbg_kbd", dict(loc=(0.45, -0.75, 1.05), target=(0.25, -0.05, 0.76), hfov=45, aspect=1.6)),
                         ("dbg_back", dict(loc=(0.78, 0.33, 1.2), target=(0.2, 0.26, 1.0), hfov=60, aspect=1.6)),
                         ("dbg_gp", dict(loc=(0.04, -0.28, 1.02), target=(-0.005, 0.07, 0.765), hfov=34, aspect=1.6)),
                         ("dbg_fan", dict(loc=(-0.34, -0.70, 0.98), target=(-0.52, -0.235, 0.88), hfov=30, aspect=1.6)),
                         ("dbg_paddle", dict(loc=(0.40, -0.72, 0.80), target=(0.42, -0.30, 0.70), hfov=14, aspect=1.6))):
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
    for ob in bpy.data.objects:
        if ob.get("runtime_overlay"):
            ob.hide_render = False
        if ob.get("shadow_decal"):
            ob.hide_render = True       # the preview keeps the full-scene shadows
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
