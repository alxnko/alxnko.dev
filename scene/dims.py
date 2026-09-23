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
RAIL = (0.05, 0.50, 0.03)     # side rails under the top
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
LAPTOP = dict(x=-0.344, y=-0.012, yaw=15.0, base=(0.36, 0.265, 0.025), lid_t=0.008,
              open_deg=110.0, screen=(0.345, 0.216), bezel_side=0.0075,
              bezel_top=0.009, chin=0.02, tilt=11.0, front_z=0.028)
LSTAND = dict(xs=0.112, bar=(0.011, 0.004), pad=0.0015, rail=(-0.126, 0.104))

# --- ultrawide (34" 21:9, 1500R) ---------------------------------------------
# yaw (deg, + = counter-clockwise from above): the left side swings forward towards the
# laptop; the whole monitor (panel, housing, ring, stand) swivels about the stand neck
MON = dict(x=0.20, front_y=0.245, yaw=7.0, screen=(0.80, 0.335), radius=1.5, bezel=0.006,
           chin=0.016, corner=0.008, screen_bottom=0.11, panel_t=0.013,
           back=(0.54, 0.27, 0.038), ring_r=0.09, ring_tube=0.004)
STAND = dict(neck=(0.075, 0.03), base=(0.25, 0.14, 0.012), base_dy=0.02)   # base centre behind front_y


def mon_neck_y():
    """y of the stand neck axis = the monitor's swivel axis (x = MON x)."""
    return MON["front_y"] + MON["panel_t"] + MON["back"][2] - 0.002 + 0.012 + STAND["neck"][1] / 2

# --- input -------------------------------------------------------------------
KBD = dict(x=0.17, front_from_edge=0.105, yaw=-2.0, size=(0.400, 0.1375, 0.022),
           unit=0.01905, pitch=3.0)
PAD = dict(x=0.415, y=0.06, size=(0.36, 0.36, 0.003), yaw=1.5)
MOUSE = dict(x=0.45, y=-0.05, yaw=-14.0, size=(0.105, 0.072, 0.07), tilt=57.0)
GAMEPAD = dict(x=0.05, y=0.085, yaw=-9.0, width=0.161)

# --- fan + cat ------------------------------------------------------------------
FAN = dict(x=-0.487, y=-0.25, yaw=6.0, r=0.09, depth=0.10, center_h=0.106)
# sitting upright on the drum top (brand mark as a cat): slim torso (width <= 0.55 x height),
# head on top of it (diamond, ~0.9 x the shoulder width), ~17 cm tall with the ears.
# yaw: faces the viewer, turned a little towards the laptop; head_yaw: the head a bit more
CAT = dict(yaw=22.0, body_h=0.108, head_w=0.040, head_up=0.0175, head_down=0.0145, head_d=0.017,
           head_gap=0.0025, head_yaw=12.0, head_tilt=-4.0)

# --- misc -----------------------------------------------------------------------
SERVER = dict(x=0.84, y=0.17, size=(0.45, 0.30, 0.18))

# --- room -------------------------------------------------------------------------
WALL_Y = 0.35                 # back wall plane
LEFT_X = -1.40                # left wall plane
FLOOR = (4.0, 4.0)
ROOM_H = 2.7
WINDOW = dict(y=-0.40, w=0.90, h=1.20, sill=0.85, depth=0.22)
SOCKET = dict(x=-0.42, z=0.60)
CONDUIT_X = 0.66

# --- cameras ------------------------------------------------------------------------
CAM_DESK = dict(loc=(-0.04, -1.55, 1.42), target=(-0.07, 0.02, 0.88), hfov=50.0, aspect=1.6)
CAM_WIDE = dict(loc=(0.95, -2.55, 1.85), target=(-0.15, 0.0, 0.85), hfov=55.0, aspect=1.6)
