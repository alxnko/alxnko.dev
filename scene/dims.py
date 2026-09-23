"""Real-world measurements of the owner's desk, in metres (Blender Z-up).

Origin: floor, under the centre of the desk top. +X right, +Y away from the
viewer (towards the back wall), +Z up. The glTF exporter converts to Y-up.
Values come from the reference photos (docs/superpowers/decisions, D6) and were
tuned by eye against them.
"""

# --- desk (sit-stand, preset 1) --------------------------------------------
DESK_H = 0.74                 # top surface height (preset 1)
PRESETS = (0.74, 0.95, 1.12)
RANGE = (0.70, 1.20)
STEP = 0.05
TOP = (1.20, 0.60, 0.025)     # w, d, thickness
TOP_BEVEL = 0.003
LEG_X = 0.52                  # frame legs at +-LEG_X
FOOT = (0.065, 0.60, 0.032)   # T-foot
LOWER_COL = (0.060, 0.045)    # static inner column, floor .. LOWER_TOP
LOWER_TOP = 0.68
UPPER_COL = (0.072, 0.056)    # outer sleeve rides with the rig
UPPER_BOTTOM = 0.18           # at preset 1 (world z)
RAIL = (0.05, 0.30, 0.03)     # side brackets under the top (pass 8: short, centred on the column)
TRAY = (0.80, 0.12, 0.075)    # cable tray under the rear edge
PADDLE = dict(x=0.42, size=(0.13, 0.045, 0.022), below=0.03)

# --- laptop (16", 16:10) -----------------------------------------------------
# pass 4 (photos ref-new/3,4): the laptop is yawed towards the desk centre (its right side
# further back) and pulled right so its lid ends a couple of cm left of / in front of the
# ultrawide's left bezel - the two screens read as one V-shaped workspace. y is kept just
# behind the fan so the stand's front-left corner clears the fan's rear lip.
# it sits on a black foldable scissor stand (photos ref-new/1-4): keyboard deck tilted
# up towards the back (front bottom edge ~2.2 cm, rear ~7.7 cm above the desk), lid
# opened so the screen leans back only a little in world space
LAPTOP = dict(x=-0.350, y=0.022, yaw=27.0, base=(0.36, 0.265, 0.025), lid_t=0.008,
              open_deg=110.0, screen=(0.345, 0.216), bezel_side=0.0075,
              bezel_top=0.009, chin=0.02, tilt=11.0, front_z=0.028)
LSTAND = dict(xs=0.112, bar=(0.011, 0.004), pad=0.0015, rail=(-0.126, 0.104))

# --- ultrawide (34" 21:9, 1500R) ---------------------------------------------
# yaw (deg, + = counter-clockwise from above): the left side swings forward towards the
# laptop; the whole monitor (panel, housing, ring, stand) swivels about the stand neck
MON = dict(x=0.20, front_y=0.17, yaw=-12.0, screen=(0.80, 0.335), radius=1.5, bezel=0.006,
           chin=0.016, corner=0.008, screen_bottom=0.11, panel_t=0.013,
           back=(0.54, 0.27, 0.038), ring_r=0.09, ring_tube=0.004)
# base: a plain flat black rectangular plate on the desk (photo 20), swivels with the monitor
STAND = dict(neck=(0.075, 0.03), base=(0.26, 0.18, 0.006), base_dy=0.0)   # base centre behind front_y


def mon_neck_y():
    """y of the stand neck axis = the monitor's swivel axis (x = MON x)."""
    return MON["front_y"] + MON["panel_t"] + MON["back"][2] - 0.002 + 0.012 + STAND["neck"][1] / 2

# --- input -------------------------------------------------------------------
# pass 7 (photo images/20): keyboard well forward, square to the desk edge, a little left
# of the monitor centre; its numpad end rests on the big pad's left edge (rest_on_pad: the
# case rolls up by the pad thickness about its left bottom edge). Pad rotated a few degrees,
# from under the monitor's right half to the front; mouse on it right of the keyboard;
# gamepad behind the keyboard towards the laptop.
KBD = dict(x=0.12, front_from_edge=0.055, yaw=0.0, size=(0.400, 0.1375, 0.022),
           unit=0.01905, pitch=3.0, rest_on_pad=True)
PAD = dict(x=0.395, y=-0.12, size=(0.32, 0.30, 0.003), yaw=-4.0)
MOUSE = dict(x=0.46, y=-0.13, yaw=-8.0, size=(0.105, 0.072, 0.07), tilt=57.0)
GAMEPAD = dict(x=0.0, y=0.02, yaw=-5.0, width=0.161)

# --- fan + cat ------------------------------------------------------------------
FAN = dict(x=-0.487, y=-0.25, yaw=6.0, r=0.09, depth=0.10, center_h=0.106)
# pass-2 loaf (beb42a2, the owner's pick): lying over the drum top, head low at the laptop end,
# merged into the chest (no neck). y_shift: the pass-2 drum was 7 cm deep, this one 10 cm -
# slide the cat forward so the paws drape over the front edge as before. pivot: head-frame
# offset of the gaze pivot from the head centre (x = gaze, z = up): inside the lower back
CAT = dict(head_w=0.064, head_yaw=40.0, head_tilt=6.0,     # yaw: turned towards the laptop; tilt > 0: chin up
           y_shift=-0.015, phi_shift=-8.0, pivot=(0.0, 0.0, -0.008))

# --- pass 9 props (owner photos 3d-table-references/headphones, sharks) -----------------
# QCY H3S over-ear headphones lying on the desk in front of the laptop, right of the fan
# (headphones/1.jpg): the band lying back, leaning; the cups at the front, one lower.
# pose: roll about the cup axis (band leans back), then tilt about the front-back axis
# (the left cup lower), then yaw; the lowest point rests on the desk.
HEADPHONES = dict(x=-0.240, y=-0.170, yaw=-22.0, roll=-58.0, tilt=24.0,
                  band_r=0.080, band_w=0.036, band_t=0.011,
                  cup=(0.041, 0.050), shell=(0.036, 0.062), cushion=(0.012, 0.036))
# sharkslides foam slides on the floor under the desk's right end, left of the right foot,
# toes towards the viewer (sharks/4jpg), casually splayed. Real size (EU 42-43): 28 x 11 cm,
# 7-8 cm tall at the head. x/y centre, yaw (deg)
SLIDES = dict(size=(0.110, 0.280), pair=((0.200, -0.070, 9.0), (0.402, -0.030, -5.0)))

# --- misc -----------------------------------------------------------------------
SERVER = dict(x=0.84, y=0.17, size=(0.45, 0.30, 0.18))

# --- room -------------------------------------------------------------------------
WALL_Y = 0.35                 # back wall plane
LEFT_X = -1.40                # left wall plane
FLOOR = (4.0, 4.0)
ROOM_H = 2.7
WINDOW = dict(y=-0.40, w=0.90, h=1.20, sill=0.85, depth=0.22)
SOCKET = dict(x=-0.67, z=0.30)   # pass 8: below the rail line (at 0.60 its top edge peeked out under the desk top)
CONDUIT_X = 0.66

# --- cameras ------------------------------------------------------------------------
CAM_DESK = dict(loc=(0.16, -1.55, 1.42), target=(-0.06, 0.02, 0.88), hfov=50.0, aspect=1.6)
CAM_WIDE = dict(loc=(0.95, -2.55, 1.85), target=(-0.15, 0.0, 0.85), hfov=55.0, aspect=1.6)
