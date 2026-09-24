"""Instagram story hook: 3.5 s cinematic push-out from the cat on the fan to the site's phone
desk camera. Night look, path traced (Cycles/OptiX + OIDN).

ALXNKO_SCENE_WORK=/var/tmp/alxnko-story/work \
blender -b --factory-startup -P /var/tmp/alxnko-story/blender/hook.py -- \
    [--frames 1,45,105] [--scale 25] [--samples 128] [--out /var/tmp/alxnko-story/hook]
    4:5 feed version: --res 1080x1350 --end_vfov 60.474 --start_vfov <v> --out .../hook-4x5

Needs $ALXNKO_SCENE_WORK/desk.blend (scene/build.py) and the screen textures (scene/screens.py).
Reuses scene/common.py (night rig, GPU) and scene/render_posters.py (runtime overlay materials).
"""
from __future__ import annotations

import math
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]  # the site repo (video/blender/hook.py)
sys.dont_write_bytecode = True
sys.path.insert(0, str(REPO / "scene"))
os.environ.setdefault("ALXNKO_SCENE_WORK", "/var/tmp/alxnko-story/work")

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common as C  # noqa: E402
import render_posters as P  # noqa: E402  (import only: main() is guarded)

A = C.args()
WORK = C.WORK
OUT = Path(A.get("out", "/var/tmp/alxnko-story/hook"))
SCALE = int(A.get("scale", "100"))
SAMPLES = int(A.get("samples", "160"))
RES = tuple(int(x) for x in A.get("res", "1080x1920").split("x"))
FRAMES = [int(f) for f in A["frames"].split(",")] if "frames" in A else list(range(1, 106))
N = 105
FPS = 30
GREEN = C.PRIM["green"]           # #00ff82

# ---------------------------------------------------------------- tunables
EXPOSURE = float(A.get("exposure", "0.85"))
LOOK = A.get("look", "AgX - Punchy")
# emitters: (seen by the camera, light they throw into the room). The camera value keeps the
# glow saturated under AgX; the light value keeps the room lit like the night rig.
SCREEN_MON = (float(A.get("screen_mon", "1.2")), float(A.get("mon_light", "5.0")))
SCREEN_LAP = (float(A.get("screen_lap", "1.05")), float(A.get("lap_light", "4.0")))
RING_EMIT = (1.6, 8.0)            # monitor ring (the real emitter that lights the wall)
RING_GLOW = 0.30                  # additive wall glow quad peak (poster: 0.40 display-referred)
FAN_RING = (float(A.get("fan_ring", "1.4")), 4.0)
FAN_DISP = (1.2, 1.2)
BACKLIGHT = 0.9

# ---------------------------------------------------------------- camera path
END_LOC = Vector((0.16, -1.55, 1.42))
END_TGT = Vector((-0.0502, -0.0501, 0.9041))
END_VFOV = float(A.get("end_vfov", "79.317"))   # 9:16 phone; 4:5 feed = 60.474
CAT_HEAD = Vector((-0.447, -0.278, 1.000))
START_LOC = Vector(tuple(float(x) for x in A.get("start", "-0.27,-0.92,0.88").split(",")))
START_TGT = Vector(tuple(float(x) for x in A.get("start_tgt", "-0.47,-0.29,0.965").split(",")))
START_VFOV = float(A.get("start_vfov", "36"))
SENSOR_H = 24.0                   # vertical sensor (portrait 13.5 x 24 mm)


def smoother(x):
    x = min(1.0, max(0.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


def sstep(e0, e1, x):
    return smoother((x - e0) / (e1 - e0))


def progress(t):
    """C2 time remap: a slow drift over the whole shot + the pull-back from t0 on.
    Zero velocity/acceleration at both ends; frames 1-45 cover ~10 % of the path."""
    w1, t0 = 0.12, 0.28
    return w1 * smoother(t) + (1 - w1) * smoother((t - t0) / (1 - t0))


def bez(p0, p1, p2, p3, u):
    a = 1 - u
    return p0 * a ** 3 + p1 * 3 * a * a * u + p2 * 3 * a * u * u + p3 * u ** 3


# position: leave the cat orbiting right + rising, arrive along the end camera's optical axis
BACK = (END_LOC - END_TGT).normalized()
P1 = START_LOC + Vector((0.20, -0.02, 0.10))
P2 = END_LOC - BACK * 0.55
# target: lingers on the cat, then settles on the site target
T1 = START_TGT + Vector((0.05, 0.02, 0.02))
T2 = END_TGT + Vector((-0.08, -0.02, 0.0))


ORBIT_PIVOT = Vector((-0.47, -0.29, 0.0))
ORBIT_DEG = float(A.get("orbit", "14"))
ORBIT_RISE = 0.05


def cam_state(frame):
    t = (frame - 1) / (N - 1)
    u = progress(t)
    loc = bez(START_LOC, P1, P2, END_LOC, u)
    # the hook's glide: orbit round the cat + rise (sine ease in-out over the first ~60 %),
    # faded out by the pull-back so the end camera is exact
    e = 0.5 - 0.5 * math.cos(math.pi * min(t / 0.6, 1.0))
    k = 1.0 - u
    rel = loc - ORBIT_PIVOT
    ang = math.radians(ORBIT_DEG) * e * k
    ca, sa = math.cos(ang), math.sin(ang)
    loc = ORBIT_PIVOT + Vector((rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca, rel.z + ORBIT_RISE * e * k))
    tgt = bez(START_TGT, T1, T2, END_TGT, u)
    # focal length: log-lerp of vfov-equivalent lens
    l0 = (SENSOR_H / 2) / math.tan(math.radians(START_VFOV) / 2)
    l1 = (SENSOR_H / 2) / math.tan(math.radians(END_VFOV) / 2)
    lens = math.exp(math.log(l0) + (math.log(l1) - math.log(l0)) * u)
    # focus: on the cat's head, handing over to the desk target as we pull out
    fw = sstep(0.15, 0.75, u)
    d_cat = (CAT_HEAD - loc).length
    d_tgt = (END_TGT - loc).length
    focus = d_cat + (d_tgt - d_cat) * fw
    # aperture: f/2 -> f/32 (log), fully open-looking only early; no visible blur at the end
    aw = sstep(0.12, 0.85, u)
    fstop = math.exp(math.log(2.0) + (math.log(32.0) - math.log(2.0)) * aw)
    return loc, tgt, lens, focus, fstop, u


# ---------------------------------------------------------------- scene

def camsplit(m, cam, light):
    """Emission strength = `cam` for camera rays, `light` for everything else."""
    nt = m.node_tree
    for em in [n for n in nt.nodes if n.type == "EMISSION"]:
        lp = nt.nodes.new("ShaderNodeLightPath")
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["To Min"].default_value = light
        mr.inputs["To Max"].default_value = cam
        nt.links.new(lp.outputs["Is Camera Ray"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], em.inputs["Strength"])
    return m


def setup_scene():
    bpy.ops.wm.open_mainfile(filepath=str(WORK / "desk.blend"))
    sc = bpy.context.scene
    C.apply_rig("night")
    objs = bpy.data.objects
    # runtime overlays on, helpers/decals/hit boxes off (the path tracer casts real shadows)
    for ob in objs:
        if ob.get("runtime_overlay"):
            ob.hide_render = False
        if ob.get("shadow_decal") or ob.get("hit"):
            ob.hide_render = True
    objs["window_sky"].hide_render = False
    P.assign(objs["window_sky"], P.sky_material("sky_n", *P.SKY["night"], 0.25, P.BG["night"]))
    # screens: the real textures (screens.py), emissive enough to light the desk
    P.assign(objs["screen_monitor"], camsplit(P.image_emission("scr_m", WORK / "screen-monitor.png"), *SCREEN_MON))
    P.assign(objs["screen_laptop"], camsplit(P.image_emission("scr_l", WORK / "screen-laptop.png"), *SCREEN_LAP))
    P.assign(objs["fan_display"], camsplit(P.image_emission("fan_disp", WORK / "fan-display.png"), *FAN_DISP))
    # RGB rings + wall glow + backlights (runtime look)
    P.assign(objs["ring"], camsplit(P.flat_emission("ring_n", GREEN, 1.0), *RING_EMIT))
    objs["ring_glow"].hide_render = False
    P.assign(objs["ring_glow"], P.glow_material("glow_n", GREEN, RING_GLOW))
    P.assign(objs["fan_ring"], camsplit(P.flat_emission("fan_ring_n", GREEN, 1.0), *FAN_RING))
    for name in ("kbd_glow", "laptop_kbd_glow"):
        P.assign(objs[name], P.flat_glow_material(f"{name}_n", GREEN, BACKLIGHT))
    for name, col in P.LED.items():
        if name in objs:
            P.assign(objs[name], P.flat_emission(f"led_{name}", col, 4.0) if col else P.flat_emission("off", "#050506", 1.0))

    # soft cool fill from the front-right (off-screen all shot): gives the cat's faces
    # some shape without lifting the room
    fl = bpy.data.lights.new("cat_fill", "AREA")
    fl.shape = "DISK"
    fl.size = 0.5
    fl.energy = float(A.get("fill", "2.5"))
    fl.color = C.hex_lin("#9fb4d8")[:3]
    fo = bpy.data.objects.new("cat_fill", fl)
    sc.collection.objects.link(fo)
    fo.location = (0.05, -0.95, 1.35)
    fo.rotation_euler = (CAT_HEAD - fo.location).to_track_quat("-Z", "Y").to_euler()
    fo.visible_camera = False

    # fan blades: slow spin about their local Y (hub axis), ~0.6 rev over the shot
    bl = objs["fan_blades"]
    bl.rotation_mode = "XYZ"
    r0 = bl.rotation_euler.copy()
    for f in (0, N + 1):
        bl.rotation_euler = (r0.x, r0.y + math.radians(-200.0 * f / N), r0.z)
        bl.keyframe_insert("rotation_euler", frame=f)
    for fc in _fcurves(bl):
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"

    # camera
    cd = bpy.data.cameras.new("hook_cam")
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = SENSOR_H
    cd.sensor_width = SENSOR_H * RES[0] / RES[1]
    cd.clip_start = 0.01
    cd.clip_end = 30.0
    cd.dof.use_dof = True
    cd.dof.aperture_blades = 7
    cd.dof.aperture_rotation = math.radians(10)
    cam = bpy.data.objects.new("hook_cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    prev = None
    for f in range(0, N + 2):         # one frame of handles either side for motion blur
        loc, tgt, lens, focus, fstop, _ = cam_state(min(max(f, 1), N))
        cam.location = loc
        e = (tgt - loc).to_track_quat("-Z", "Y").to_euler("XYZ", prev) if prev else \
            (tgt - loc).to_track_quat("-Z", "Y").to_euler("XYZ")
        prev = e
        cam.rotation_euler = e
        cd.lens = lens
        cd.dof.focus_distance = focus
        cd.dof.aperture_fstop = fstop
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)
        cd.keyframe_insert("lens", frame=f)
        cd.dof.keyframe_insert("focus_distance", frame=f)
        cd.dof.keyframe_insert("aperture_fstop", frame=f)
    for idb in (cam, cd):
        for fc in _fcurves(idb):
            for k in fc.keyframe_points:
                k.interpolation = "LINEAR"

    # render
    C.setup_gpu(sc)
    C.no_stamp(sc)
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 1, N
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = SCALE
    cy = sc.cycles
    cy.samples = SAMPLES
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.adaptive_min_samples = 32
    cy.seed = 7
    cy.use_animated_seed = False
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    cy.denoising_prefilter = "ACCURATE"
    try:
        cy.denoising_use_gpu = True
    except Exception:  # noqa: BLE001
        pass
    cy.max_bounces = 6
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 3
    cy.transmission_bounces = 2
    cy.transparent_max_bounces = 8
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.sample_clamp_indirect = 8.0
    cy.filter_width = 1.5
    sc.render.use_persistent_data = True
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 0.35
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = LOOK
    except TypeError:
        sc.view_settings.look = "None"
    sc.view_settings.exposure = EXPOSURE
    sc.view_settings.gamma = 1.0
    sc.display_settings.display_device = "sRGB"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "8"
    sc.render.film_transparent = False
    return sc


def _fcurves(idb):
    ad = idb.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    try:
        return list(act.fcurves)
    except AttributeError:   # layered actions (4.4+/5.x)
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out += list(cb.fcurves)
        return out


def main():
    sc = setup_scene()
    OUT.mkdir(parents=True, exist_ok=True)
    t_all = time.time()
    for f in FRAMES:
        loc, tgt, lens, focus, fstop, u = cam_state(f)
        sc.frame_set(f)
        sc.render.filepath = str(OUT / f"{f:04d}.png")
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"[hook] frame {f} u={u:.3f} lens={lens:.1f}mm f/{fstop:.1f} focus={focus:.2f}m "
              f"{time.time() - t0:.1f}s -> {sc.render.filepath}", flush=True)
    print(f"[hook] total {time.time() - t_all:.1f}s for {len(FRAMES)} frames", flush=True)


if __name__ == "__main__":
    main()
