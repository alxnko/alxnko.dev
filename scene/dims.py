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
# placed so that from cam_desk and cam_wide its lid never covers the ultrawide's
# screen, and the fan + cat in front-left never cover the laptop screen
LAPTOP = dict(x=-0.40, y=0.05, yaw=2.0, base=(0.36, 0.265, 0.025), lid_t=0.008,
              open_deg=105.0, screen=(0.345, 0.216), bezel_side=0.0075,
              bezel_top=0.009, chin=0.02)

# --- ultrawide (34" 21:9, 1500R) ---------------------------------------------
MON = dict(x=0.20, front_y=0.20, screen=(0.80, 0.335), radius=1.5, bezel=0.006,
           chin=0.016, corner=0.008, screen_bottom=0.11, panel_t=0.013,
           back=(0.54, 0.27, 0.038), ring_r=0.09, ring_tube=0.004)
STAND = dict(neck=(0.075, 0.03), base=(0.25, 0.14, 0.012), base_y=0.228)

# --- input -------------------------------------------------------------------
KBD = dict(x=0.12, front_from_edge=0.105, yaw=-2.0, size=(0.38, 0.135, 0.022),
           unit=0.019, pitch=3.0)
PAD = dict(x=0.415, y=0.06, size=(0.36, 0.36, 0.003), yaw=1.5)
MOUSE = dict(x=0.45, y=-0.05, yaw=-14.0, size=(0.105, 0.072, 0.07), tilt=57.0)
GAMEPAD = dict(x=-0.005, y=0.075, yaw=-9.0, width=0.161)

# --- fan + cat ------------------------------------------------------------------
FAN = dict(x=-0.525, y=-0.24, yaw=16.0, r=0.09, depth=0.07, center_h=0.118)
CAT = dict(head_w=0.064, head_yaw=40.0, head_tilt=6.0)     # yaw: turned towards the laptop; tilt > 0: chin up

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
CAM_DESK = dict(loc=(-0.02, -1.55, 1.42), target=(-0.03, 0.02, 0.88), hfov=50.0, aspect=1.6)
CAM_WIDE = dict(loc=(0.95, -2.55, 1.85), target=(-0.15, 0.0, 0.85), hfov=55.0, aspect=1.6)
