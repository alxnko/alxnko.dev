"""Posters, OG base render and atlas check renders (plan Task 4).

blender -b --factory-startup -P scene/render_posters.py -- --mode posters|check [--size 4096]

The posters are rendered from the *baked atlas* (unlit, exactly what the
runtime shows) plus the runtime-only layers (screens, ring + wall glow, fan ring + readout,
keyboard backlights, LEDs, window sky), so the live scene can cross-fade in over the poster at the `desk`
landmark with no pop. `--mode check` renders cam_desk + cam_wide for both rigs
at 1200x750 for visual review.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common as C  # noqa: E402

A = C.args()
SIZE = A.get("size", "4096")
GREEN = C.PRIM["green"]
# the neutral-baked parts in the default `rgb` (R86), as src/scene/index.ts tints them: the keys
# and the cat take the palette's tint, the paddle legends (lit labels) its fill
TINTED = {"kbd_accent": C.RGB["green"]["tint"], "cat_body": C.RGB["green"]["tint"],
          "cat_head": C.RGB["green"]["tint"], "cat_tail": C.RGB["green"]["tint"],
          "paddle_glyphs": C.RGB["green"]["fill"]}
POSTER = (1600, 1000)
PORTRAIT = (800, 1000)
RING = {"day": 0.9, "night": 1.0}          # ring emissive (display-referred)
GLOW = {"day": 0.22, "night": 0.40}        # additive wall glow peak
BACKLIGHT = {"day": 0.6, "night": 0.9}     # additive keyboard backlight (flat, soft edge)
OVERLAYS = ("fan_ring", "fan_display", "kbd_glow", "laptop_kbd_glow")
HITS = ("hit_laptop", "hit_monitor", "hit_paddle_1", "hit_paddle_2", "hit_paddle_3", "hit_paddle_up",
        "hit_paddle_down")
SKY = {"day": ("#dfe8ef", "#a9bfd3"), "night": ("#101726", "#05070c")}  # bottom, top
LED = {"led_kbd": GREEN, "led_paddle": None, "led_srv_0": C.PRIM["amber"], "led_srv_1": "#dfe6ff",
       "led_srv_2": "#dfe6ff", "led_srv_3": C.PRIM["amber"], "led_srv_4": "#dfe6ff", "led_srv_5": None}
BG = {"day": C.TOKENS["semantic"]["light"]["bg"], "night": C.TOKENS["semantic"]["dark"]["bg"]}


def node_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return m, nt, nt.nodes.new("ShaderNodeOutputMaterial")


def image_emission(name, path, flip_v=False, strength=1.0, uv="UVMap"):
    m, nt, out = node_mat(name)
    img = bpy.data.images.load(str(path), check_existing=True)
    img.colorspace_settings.name = "sRGB"
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Cubic"
    tex.extension = "EXTEND"
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = uv
    if flip_v:
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Location"].default_value = (0, 1, 0)
        mp.inputs["Scale"].default_value = (1, -1, 1)
        nt.links.new(uvn.outputs["UV"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    else:
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def tinted_emission(name, path, tint_hex, uv="UVMap"):
    """The atlas times tint / base (linear), what the runtime's tinted material does."""
    m = image_emission(name, path, uv=uv)
    nt = m.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
    em = next(n for n in nt.nodes if n.type == "EMISSION")
    t, b = C.hex_lin(tint_hex), C.hex_lin(C.SC["tintBase"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    mul.inputs["B"].default_value = (t[0] / b[0], t[1] / b[1], t[2] / b[2], 1.0)
    nt.links.new(tex.outputs["Color"], mul.inputs["A"])
    nt.links.new(mul.outputs["Result"], em.inputs["Color"])
    return m


def multiply_material(name, path, uv="UVMap"):
    """Unlit multiply decal: a Transparent BSDF tinted by the atlas texel (dst * src, as the
    runtime does it: in display space)."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(path), check_existing=True)
    tex.interpolation = "Linear"
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = uv
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    # the runtime multiplies the display-encoded frame by the sampled (linear) texel; in linear
    # scene space that is a multiply by texel^2.2 - match it, so posters == runtime
    gm = nt.nodes.new("ShaderNodeGamma")
    gm.inputs["Gamma"].default_value = 2.2
    nt.links.new(tex.outputs["Color"], gm.inputs["Color"])
    nt.links.new(gm.outputs["Color"], tr.inputs["Color"])
    nt.links.new(tr.outputs["BSDF"], out.inputs["Surface"])
    return m


def flat_emission(name, hex_color, strength):
    return C.emission_mat(name, hex_color, strength)


def glow_material(name, hex_color, peak):
    """Additive radial glow: transparent + emission (what the runtime quad does)."""
    m, nt, out = node_mat(name)
    uvn = nt.nodes.new("ShaderNodeUVMap")
    sub = nt.nodes.new("ShaderNodeVectorMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = (0.5, 0.5, 0.0)
    nt.links.new(uvn.outputs["UV"], sub.inputs[0])
    ln = nt.nodes.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    nt.links.new(sub.outputs[0], ln.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.interpolation_type = "SMOOTHSTEP"
    mr.inputs["From Min"].default_value = 0.5
    mr.inputs["From Max"].default_value = 0.0
    nt.links.new(ln.outputs["Value"], mr.inputs["Value"])
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = 1.8
    nt.links.new(mr.outputs["Result"], pw.inputs[0])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = peak
    nt.links.new(pw.outputs[0], mul.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = C.hex_lin(hex_color)
    nt.links.new(mul.outputs[0], em.inputs["Strength"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(tr.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs["Surface"])
    try:
        m.surface_render_method = "BLENDED"
    except Exception:  # noqa: BLE001
        pass
    return m


def flat_glow_material(name, hex_color, peak):
    """Additive flat backlight, soft only at the very edge (runtime glowMaterial uShape = 0)."""
    m, nt, out = node_mat(name)
    uvn = nt.nodes.new("ShaderNodeUVMap")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uvn.outputs["UV"], sep.inputs[0])
    edges = []
    for ax in ("X", "Y"):
        inv = nt.nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(sep.outputs[ax], inv.inputs[1])
        mn = nt.nodes.new("ShaderNodeMath")
        mn.operation = "MINIMUM"
        nt.links.new(sep.outputs[ax], mn.inputs[0])
        nt.links.new(inv.outputs[0], mn.inputs[1])
        edges.append(mn.outputs[0])
    mn = nt.nodes.new("ShaderNodeMath")
    mn.operation = "MINIMUM"
    nt.links.new(edges[0], mn.inputs[0])
    nt.links.new(edges[1], mn.inputs[1])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.interpolation_type = "SMOOTHSTEP"
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 0.08
    mr.inputs["To Max"].default_value = peak
    nt.links.new(mn.outputs[0], mr.inputs["Value"])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = C.hex_lin(hex_color)
    nt.links.new(mr.outputs["Result"], em.inputs["Strength"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(tr.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs["Surface"])
    return m


def sky_material(name, bottom, top, fade, bg):
    m, nt, out = node_mat(name)
    uvn = nt.nodes.new("ShaderNodeUVMap")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uvn.outputs["UV"], sep.inputs[0])
    inv = nt.nodes.new("ShaderNodeMath")  # Blender v is flipped (stored glTF v = 1 - v)
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(sep.outputs["Y"], inv.inputs[1])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = C.hex_lin(C.mix_hex(bottom, bg, fade))
    mix.inputs["B"].default_value = C.hex_lin(C.mix_hex(top, bg, fade))
    nt.links.new(inv.outputs[0], mix.inputs["Factor"])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(mix.outputs["Result"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def world_bg(hex_color):
    w = bpy.data.worlds.new("bg")
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = C.hex_lin(hex_color)
    bg.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])
    return w


def assign(ob, m):
    if not ob.data.materials:
        ob.data.materials.append(m)
    for i in range(len(ob.material_slots)):
        ob.material_slots[i].material = m


def setup(rig, atlas_path, objects=None, window_fade=0.25, screens=True, uv="UVMap"):
    """Make every object unlit: baked meshes sample the atlas, runtime meshes
    get their poster look. `objects` maps role -> list of objects."""
    sc = bpy.context.scene
    objs = objects if isinstance(objects, dict) else {o.name: o for o in (objects or bpy.data.objects)}
    atlas = image_emission(f"atlas_{rig}", atlas_path, uv=uv)
    for name in ("static", "desk_baked", "fan_blades"):
        if name in objs:
            assign(objs[name], atlas)
    for name, tint in TINTED.items():
        if name in objs:
            assign(objs[name], tinted_emission(f"atlas_{tint[1:]}_{rig}", atlas_path, tint, uv=uv))
    for name in ("shadow_floor", "shadow_wall"):
        if name in objs:
            objs[name].hide_render = False
            assign(objs[name], multiply_material(f"shadow_{rig}", atlas_path, uv=uv))
    black = flat_emission("off", "#050506", 1.0)
    if screens:
        assign(objs["screen_laptop"], image_emission("scr_l", C.WORK / "screen-laptop.png", uv=uv))
        assign(objs["screen_monitor"], image_emission("scr_m", C.WORK / "screen-monitor.png", uv=uv))
    else:
        assign(objs["screen_laptop"], black)
        assign(objs["screen_monitor"], black)
    assign(objs["ring"], flat_emission(f"ring_{rig}", GREEN, RING[rig]))
    assign(objs["ring_glow"], glow_material(f"glow_{rig}", GREEN, GLOW[rig]))
    objs["ring_glow"].hide_render = False
    # runtime overlays in the poster state: fan ring + both backlights green, fan readout "100"
    for name in OVERLAYS:
        if name in objs:
            objs[name].hide_render = False
    if "fan_ring" in objs:
        assign(objs["fan_ring"], flat_emission(f"fan_ring_{rig}", GREEN, RING[rig]))
    for name in ("kbd_glow", "laptop_kbd_glow"):
        if name in objs:
            assign(objs[name], flat_glow_material(f"{name}_{rig}", GREEN, BACKLIGHT[rig]))
    if "fan_display" in objs:
        disp = C.WORK / "fan-display.png"
        assign(objs["fan_display"], image_emission("fan_disp", disp, uv=uv) if screens and disp.exists()
               else black)
    for name, col in LED.items():
        if name in objs:
            assign(objs[name], flat_emission(f"led_{name}", col, 1.0) if col else black)
    if "window_sky" in objs:
        objs["window_sky"].hide_render = False
        assign(objs["window_sky"], sky_material(f"sky_{rig}", *SKY[rig], window_fade, BG[rig]))
    for name in HITS:
        if name in objs:
            objs[name].hide_render = True
    for ob in objs.values():
        if ob.type == "LIGHT":
            ob.hide_render = True
    sc.world = world_bg(BG[rig])
    sc.render.engine = "CYCLES"
    C.setup_gpu(sc)
    if A.get("device", "").upper() == "CPU":
        sc.cycles.device = "CPU"      # bit-exact across runs (GPU can differ by a pixel)
    C.no_stamp(sc)
    sc.cycles.samples = int(A.get("samples", "48"))
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.seed = 7
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 0
    sc.cycles.glossy_bounces = 0
    sc.cycles.transmission_bounces = 0
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.filter_width = 1.2
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.display_settings.display_device = "sRGB"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "8"
    sc.render.film_transparent = False
    for c in bpy.data.collections:
        if c.name.startswith("rig_"):
            c.hide_render = True


def render(cam, w, h, path):
    sc = bpy.context.scene
    sc.camera = bpy.data.objects[cam] if isinstance(cam, str) else cam
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("[posters] wrote", path)


def main():
    mode = A.get("mode", "posters")
    bpy.ops.wm.open_mainfile(filepath=str(C.WORK / "desk_uv.blend"))
    import json
    info_path = C.WORK / "bake-info.json"
    info = json.loads(info_path.read_text()) if info_path.exists() else {}
    for rig in ("night", "day"):
        fade = info.get("windowFade", {}).get(rig, 0.25)
        setup(rig, C.WORK / f"atlas-{rig}-{SIZE}.png", window_fade=fade)
        if mode == "check":
            for cam in ("cam_desk", "cam_wide"):
                render(cam, 1200, 750, C.WORK / f"check-atlas-{cam}-{rig}.png")
        else:
            render("cam_desk", *POSTER, C.WORK / f"poster-{rig}.png")
            # portrait: same camera, same *horizontal* FOV (sensor fit horizontal), taller
            # frame. This is the runtime rule for aspect < 1.6 (spec §3.4: the desk's
            # horizontal extent always fits), so the mobile cross-fade matches too.
            render("cam_desk", *PORTRAIT, C.WORK / f"poster-{rig}-portrait.png")
    if mode != "check":
        cam = bpy.data.objects["cam_desk"]
        hf = cam.data.angle
        yf = 2 * math.atan(math.tan(hf / 2) / (PORTRAIT[0] / PORTRAIT[1]))
        (C.WORK / "poster-portrait.json").write_text(json.dumps({
            "size": list(PORTRAIT), "camera": "cam_desk", "hfovDeg": round(math.degrees(hf), 4),
            "yfovDeg": round(math.degrees(yf), 4), "aspect": PORTRAIT[0] / PORTRAIT[1],
            "rule": "same position/target as cam_desk; keep hfov (50 deg) and widen yfov for aspect < 1.6"}))


if __name__ == "__main__":
    main()
