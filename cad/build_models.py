"""Mr. Agent - every 3D part of the robot and his room, modelled in FreeCAD.

Run it inside FreeCAD (the FreeCAD MCP does this with execute_code):

    p = "/path/to/Mragent/cad/build_models.py"
    exec(compile(open(p).read(), p, "exec"), {"__file__": p, "__name__": "mragent"})

It writes ../public/models.json (meshes + layout for the web app), saves
cad/mr_agent.FCStd and lays everything out in the FreeCAD window as a preview.

FreeCAD conventions: millimetres, Z up, the robot faces +Y, the robot's right is +X.
Every part is modelled around its own pivot so the app can animate it.
The export converts to three.js space: metres, Y up -> (x, y, z) = (X, Z, -Y) / 1000.
"""
import base64
import json
import math
import os
import random
import struct

import FreeCAD as App
import MeshPart
import Part

V = App.Vector
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "public", "models.json")
rng = random.Random(7)


# ======================================================================= helpers
def ellipsoid(rx, ry, rz, c=(0, 0, 0)):
    s = Part.makeSphere(1)
    m = App.Matrix()
    m.scale(rx, ry, rz)
    s = s.transformGeometry(m)
    s.translate(V(*c))
    return s


def sphere(r, c=(0, 0, 0)):
    return Part.makeSphere(r, V(*c))


def cyl(r, h, p=(0, 0, 0), d=(0, 0, 1)):
    return Part.makeCylinder(r, h, V(*p), V(*d))


def torus(R, r, p=(0, 0, 0), d=(0, 0, 1)):
    return Part.makeTorus(R, r, V(*p), V(*d))


def capsule(r0, r1, z0, z1):
    """Tapered capsule hanging down the Z axis from z0 (radius r0) to z1 (radius r1)."""
    cone = Part.makeCone(r1, r0, z0 - z1, V(0, 0, z1), V(0, 0, 1))
    return Part.makeCompound([cone, sphere(r0, (0, 0, z0)), sphere(r1, (0, 0, z1))])


def capsule_between(a, b, r):
    a, b = V(*a), V(*b)
    d = b - a
    return Part.makeCompound([cyl(r, d.Length, a, d), sphere(r, a), sphere(r, b)])


def tube(points, r):
    """A bent tube through points, built from capsules (smooth joints, no sweeps to fail)."""
    segs = [capsule_between(points[i], points[i + 1], r) for i in range(len(points) - 1)]
    return Part.makeCompound(segs)


def box(lx, ly, lz, c=(0, 0, 0)):
    return Part.makeBox(lx, ly, lz, V(c[0] - lx / 2.0, c[1] - ly / 2.0, c[2] - lz / 2.0))


def rbox(lx, ly, lz, r, c=(0, 0, 0)):
    b = box(lx, ly, lz, c)
    return b.makeFillet(r, b.Edges)


def rbox_v(lx, ly, lz, r, c=(0, 0, 0), r2=0):
    """Box with rounded vertical edges and an optional small fillet on the rest."""
    b = box(lx, ly, lz, c)
    vert = [e for e in b.Edges if abs(e.Vertexes[0].Point.z - e.Vertexes[1].Point.z) > 1e-6]
    b = b.makeFillet(r, vert)
    if r2:
        b = b.makeFillet(r2, b.Edges)
    return b


def ellipse_wire(z, rx, ry):
    """Horizontal ellipse at height z (rx must be >= ry: the major axis lies along X)."""
    return Part.Wire(Part.Ellipse(V(0, 0, z), rx, ry).toShape())


def loft(sections):
    """Smooth solid through horizontal ellipses given as (z, rx, ry)."""
    return Part.makeLoft([ellipse_wire(*s) for s in sections], True, False)


def comp(*shapes):
    return Part.makeCompound([s for s in shapes if s is not None])


def mirror_x(shape):
    return shape.mirror(V(0, 0, 0), V(1, 0, 0))


def safe(fn, fallback):
    try:
        r = fn()
        if r.isNull() or not r.isValid():
            raise ValueError("invalid result")
        return r
    except Exception as exc:  # booleans on BSpline surfaces can fail; keep the plain shape
        print("  (kept fallback:", exc, ")")
        return fallback


parts = {}
layout = {}

# ======================================================================= ROBOT
# ---- pelvis (pivot = waist; the torso sits on top of it)
parts["waistCore"] = cyl(98, 60, (0, 0, -48))
parts["waistSpring"] = comp(*[torus(103, 7, (0, 0, z)) for z in (-8, -24, -40)])
parts["hips"] = loft([(-40, 142, 108), (-88, 170, 122), (-150, 160, 112), (-188, 118, 84), (-206, 52, 40)])
parts["hipJoints"] = comp(sphere(50, (95, 0, -140)), sphere(50, (-95, 0, -140)))

# ---- torso (pivot = waist)
torso = loft([
    (0, 136, 110), (60, 162, 128), (150, 196, 154), (260, 216, 168),
    (340, 212, 163), (400, 191, 149), (440, 152, 121), (466, 96, 78), (480, 34, 30),
])
# chest emblem recess
torso = safe(lambda: torso.cut(cyl(38, 60, (0, 150, 300), (0, 1, 0))), torso)
# side vents
for sx in (1, -1):
    for z in (178, 204, 230):
        torso = safe(lambda: torso.cut(rbox(60, 70, 9, 4, (sx * 214, -10, z))), torso)
parts["torso"] = torso
seam = safe(lambda: torso.makeOffsetShape(1.2, 0.05).common(box(600, 600, 5, (0, 0, 150))).cut(torso), None)
if seam is not None:
    parts["torsoSeam"] = seam
parts["chestLight"] = cyl(31, 8, (0, 148, 300), (0, 1, 0))
parts["chestRing"] = torus(36, 3.2, (0, 158, 300), (0, 1, 0))
parts["backpack"] = rbox(236, 70, 220, 26, (0, -158, 262))
parts["batteryLeds"] = comp(*[rbox(46, 10, 15, 3, (62, -194, 205 + i * 26)) for i in range(5)])
parts["backVent"] = comp(*[rbox(110, 8, 8, 3, (-30, -194, 220 + i * 18)) for i in range(5)])

# ---- neck (pivot = top of torso)
parts["neckCollar"] = comp(torus(64, 15, (0, 0, 4)), cyl(64, 12, (0, 0, -8)))
parts["neck"] = cyl(30, 74, (0, 0, 0))
parts["neckRings"] = comp(*[torus(33, 5.5, (0, 0, z)) for z in (16, 36, 56)])
cables = {}
NECK_TOP = 74  # head pivot height in the neck frame
CABLE_R = 52


def head_surface_z(x, y):
    """Height (head frame) of the underside of the head ellipsoid at (x, y)."""
    k = math.sqrt(max(0.0, 1 - (x / 152.0) ** 2 - (y / 142.0) ** 2))
    return 150 - 140 * k


CABLE_ANGLES = (("cableRed", 205), ("cableBlue", 250), ("cableYellow", 295))
sockets = []
for name, ang in CABLE_ANGLES:
    a = math.radians(ang)
    cx, cy = CABLE_R * math.cos(a), CABLE_R * math.sin(a)
    top = NECK_TOP + head_surface_z(cx, cy) + 6  # ends just inside the head, in its socket
    pts = []
    for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
        r = CABLE_R + 20 * math.sin(math.pi * t)
        pts.append((r * math.cos(a), r * math.sin(a), -6 + (top + 6) * t))
    cables[name] = tube(pts, 6.5)
    hz = head_surface_z(cx, cy)
    sockets.append(cyl(10.5, 14, (cx, cy, hz - 8)))
    sockets.append(torus(10.5, 2.4, (cx, cy, hz - 8)))
parts.update(cables)

# ---- head (pivot = top of neck)
HR = (152, 142, 140)
HC = (0, 0, 150)
head = ellipsoid(*HR, c=HC)


def oval_prism(major, minor, scale=1.0):
    e = Part.Ellipse(V(major * scale, 0, HC[2]), V(0, 0, HC[2] + minor * scale), V(0, 0, HC[2]))
    return Part.Face(Part.Wire(e.toShape())).extrude(V(0, 340, 0))


window = oval_prism(116, 60)
cutter = safe(lambda: ellipsoid(*[r * 1.2 for r in HR], c=HC).common(window).cut(ellipsoid(*[r * 0.925 for r in HR], c=HC)), None)
if cutter is not None:
    head = safe(lambda: head.cut(cutter), head)
parts["head"] = head
parts["visor"] = safe(lambda: ellipsoid(*[r * 0.955 for r in HR], c=HC).common(oval_prism(116, 60, 0.985)),
                      ellipsoid(*[r * 0.955 for r in HR], c=HC))
layout["visor"] = {"center": [HC[0] / 1000.0, HC[2] / 1000.0, -HC[1] / 1000.0],
                   "radii": [HR[0] * 0.955 / 1000.0, HR[2] * 0.955 / 1000.0, HR[1] * 0.955 / 1000.0],
                   "halfWidth": 116 / 1000.0, "halfHeight": 60 / 1000.0}

ear = cyl(56, 40, (134, 0, 150), (1, 0, 0))
ear = safe(lambda: ear.makeFillet(12, [e for e in ear.Edges if abs(e.Vertexes[0].Point.x - 174) < 1e-3]), ear)
parts["ears"] = comp(ear, mirror_x(ear))
glow = comp(torus(40, 4.5, (175, 0, 150), (1, 0, 0)), cyl(17, 6, (173, 0, 150), (1, 0, 0)))
parts["earGlow"] = comp(glow, mirror_x(glow))
parts["cableSockets"] = comp(*sockets)
parts["antenna"] = comp(capsule_between((160, -8, 196), (182, -26, 300), 4.5), torus(9, 3, (160, -8, 196), (0.2, -0.17, 1)))
parts["antennaTip"] = sphere(11, (184, -28, 310))

# ---- arm (right arm; pivot = shoulder). The left arm mirrors these meshes in the app.
parts["shoulderPad"] = ellipsoid(86, 96, 66, (14, 0, 30))
parts["shoulderJoint"] = sphere(52)
upper = capsule(47, 42, -42, -246)
parts["upperArm"] = safe(lambda: upper.cut(torus(45.6, 2.3, (0, 0, -150))), upper)
parts["elbowJoint"] = cyl(40, 94, (-47, 0, 0), (1, 0, 0))
parts["elbowCaps"] = comp(cyl(28, 6, (47, 0, 0), (1, 0, 0)), cyl(28, 6, (-53, 0, 0), (1, 0, 0)))
fore = capsule(44, 37, -36, -226)
parts["forearm"] = safe(lambda: fore.cut(torus(43.6, 2.2, (0, 0, -62))), fore)
parts["forearmLed"] = rbox(8, 14, 104, 3.5, (40, 0, -142))
parts["wrist"] = comp(cyl(32, 34, (0, 0, -17)), torus(33, 4, (0, 0, 0)))
parts["pistonBody"] = comp(cyl(9.5, 112, (0, 0, -112)), sphere(11))
parts["pistonRod"] = comp(cyl(5, 118, (0, 0, -118)), sphere(9))
layout["arm"] = {"shoulder": [0.218, 0.360, 0.0], "elbow": -0.282, "wrist": -0.262,
                 "pistonA": [0, -0.140, -0.058], "pistonB": [0, -0.088, -0.050]}

# ---- hand: palm + articulated fingers (pivot = wrist, palm faces +Y)
parts["palm"] = rbox(80, 40, 82, 16, (0, 2, -48))
parts["palmPad"] = rbox(62, 6, 56, 2.8, (0, 21, -52))
parts["phal1"] = capsule_between((0, 0, -7), (0, 0, -28), 10.5)
parts["phal2"] = capsule_between((0, 0, -6), (0, 0, -20), 10)
parts["phal3"] = comp(capsule_between((0, 0, -6), (0, 0, -15), 9.5), ellipsoid(6, 2.2, 6, (0, -8, -16)))
parts["fingerJoint"] = sphere(8.6)
layout["hand"] = {
    "knuckles": [[x / 1000.0, -0.092, -0.004] for x in (-27, -9, 9, 27)],
    "thumb": [-0.041, -0.030, -0.016],
    "phal": [-0.034, -0.026],
}

# ---- leg (pivot = hip)
thigh = capsule(56, 50, -36, -262)
parts["thigh"] = safe(lambda: thigh.cut(torus(52.2, 2.4, (0, 0, -205))), thigh)
parts["kneeJoint"] = comp(sphere(46), cyl(30, 104, (-52, 0, 0), (1, 0, 0)))
parts["kneeCap"] = ellipsoid(40, 26, 46, (0, 40, 2))
shin = capsule(50, 42, -36, -292)
parts["shin"] = safe(lambda: shin.cut(torus(47.6, 2.3, (0, 0, -84))), shin)
parts["ankle"] = sphere(34)
foot = ellipsoid(64, 112, 48, (0, 34, -40))
parts["foot"] = safe(lambda: foot.cut(box(300, 400, 100, (0, 0, -118))), foot)
parts["sole"] = rbox(118, 206, 14, 6, (0, 34, -74))
layout["leg"] = {"hip": [0.095, -0.140, 0.0], "knee": -0.290, "ankle": -0.330, "ankleToFloor": 0.081}
layout["robot"] = {"neck": 0.470, "head": 0.074, "sitWaist": 0.550, "standWaist": 0.841}
layout["cables"] = {"angles": [a for _, a in CABLE_ANGLES], "radius": CABLE_R / 1000.0, "bulge": 0.020, "thickness": 0.0065}

# ======================================================================= DESK & CHAIR
parts["deskTop"] = rbox(1500, 750, 32, 8, (0, 0, 724))
frame = []
for sx in (-1, 1):
    for sy in (-1, 1):
        frame.append(rbox(50, 50, 708, 6, (sx * 690, sy * 300, 354)))
    frame.append(rbox(40, 620, 50, 6, (sx * 690, 0, 680)))
for sy in (-1, 1):
    frame.append(rbox(1340, 40, 50, 6, (0, sy * 300, 680)))
parts["deskFrame"] = comp(*frame)
parts["cableTray"] = safe(lambda: rbox(900, 120, 70, 6, (0, 220, 640)).cut(box(880, 100, 60, (0, 220, 650))),
                          rbox(900, 120, 70, 6, (0, 220, 640)))

spokes = [cyl(46, 52, (0, 0, 42))]
wheels = []
for i in range(5):
    a = 90 + i * 72
    s = rbox(300, 38, 26, 10, (150, 0, 66))
    s.rotate(V(0, 0, 0), V(0, 0, 1), a)
    spokes.append(s)
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    wheels.append(cyl(25, 26, (290 * ca - 13 * -sa, 290 * sa - 13 * ca, 26), (-sa, ca, 0)))
parts["chairBase"] = comp(*spokes)
parts["chairWheels"] = comp(*wheels)
parts["chairLift"] = comp(cyl(19, 220, (0, 0, 80)), cyl(30, 110, (0, 0, 80)))
parts["chairSeat"] = rbox(490, 470, 72, 30, (0, 0, 324))
back = rbox(460, 60, 480, 28)
back.rotate(V(0, 0, 0), V(1, 0, 0), -9)
back.translate(V(0, -248, 690))
parts["chairBack"] = back
parts["chairFrame"] = comp(
    rbox(300, 40, 40, 12, (0, -40, 280)),
    tube([(0, -70, 288), (0, -200, 300), (0, -262, 340), (0, -270, 470)], 16),
)
arms = []
for sx in (-1, 1):
    arms.append(capsule_between((sx * 236, -70, 330), (sx * 250, -60, 545), 14))
    arms.append(rbox(64, 250, 28, 12, (sx * 252, -20, 560)))
parts["chairArms"] = comp(*arms)

# ======================================================================= MACBOOK
base = rbox_v(356, 248, 15, 14, (0, 0, 7.5), r2=2.4)
base = safe(lambda: base.cut(rbox_v(304, 120, 4, 6, (0, 40, 15))), base)
base = safe(lambda: base.cut(rbox_v(150, 92, 1.2, 8, (0, -70, 15))), base)
parts["laptopBase"] = base
parts["laptopHinge"] = cyl(5.5, 300, (-150, 121, 13.5), (1, 0, 0))
lid = Part.makeBox(356, 6, 250, V(-178, 0, 0))
lid = lid.makeFillet(14, [e for e in lid.Edges if abs(e.Vertexes[0].Point.y - e.Vertexes[1].Point.y) > 1e-6])
parts["laptopLid"] = lid

# keyboard: rows of keys sitting in the well (floor of the well is z = 13)
ROWS = [  # (row centre y, key height, [key widths in units])
    (91.5, 9.0, [1.0] * 14),
    (75.0, 16.0, [1.0] * 13 + [1.5]),
    (56.5, 16.0, [1.5] + [1.0] * 13),
    (38.0, 16.0, [1.8] + [1.0] * 11 + [1.75]),
    (19.5, 16.0, [2.35] + [1.0] * 10 + [2.35]),
    (1.0, 16.0, [1.0, 1.0, 1.0, 1.25, 5.3, 1.25, 1.0, 1.0, 1.0]),
]
keys, key_layout = [], []
for y, h, units in ROWS:
    pitch = 19.0
    total = sum(units) * pitch
    scale = 296.0 / total
    x = -148.0
    for u in units:
        w = u * pitch * scale
        cx = x + w / 2.0
        if not (len(units) == 9 and u == 1.0 and cx > 100 and y < 5):  # leave room for arrow cluster
            keys.append(rbox_v(w - 2.6, h - 2.4, 1.6, min(2.4, (h - 2.4) / 2.2), (cx, y, 13.8)))
            key_layout.append([cx / 1000.0, (y) / 1000.0, (w - 2.6) / 1000.0, (h - 2.4) / 1000.0])
        x += w
# arrow cluster
for cx, cy, w, hh in ((113.5, -3.2, 13.0, 7.0), (128.0, 4.6, 13.0, 7.0), (128.0, -3.6, 13.0, 7.0), (142.5, -3.2, 13.0, 7.0)):
    keys.append(rbox_v(w, hh, 1.6, 2.2, (cx, cy, 13.8)))
    key_layout.append([cx / 1000.0, cy / 1000.0, w / 1000.0, hh / 1000.0])
parts["keys"] = comp(*keys)
layout["laptop"] = {"lidPivot": [0, 0.0145, -0.121], "keyTop": 0.0146, "keys": key_layout,
                    "lidSize": [0.356, 0.250], "lidThickness": 0.006, "trackpad": [0, 0.0151, 0.070, 0.150, 0.092]}

# ======================================================================= DESK PROPS
shell = cyl(42, 96).cut(cyl(37.5, 92, (0, 0, 7)))
handle = torus(26, 7.5, (40, 0, 50), (0, 1, 0)).cut(box(100, 60, 140, (38 - 50, 0, 50)))
parts["mug"] = comp(shell, handle)
parts["coffee"] = cyl(37.6, 2, (0, 0, 78))

pot = Part.makeCone(58, 74, 120).cut(Part.makeCone(52, 68, 120, V(0, 0, 8)))
parts["pot"] = pot
parts["soil"] = cyl(66, 4, (0, 0, 100))
leaves, stems = [], []
for i in range(11):
    ang = i * 33 + (i % 2) * 13
    tilt = 22 + (i % 3) * 15
    length = 105 + (i % 4) * 20
    zb = 108 + (i % 3) * 18
    leaf = ellipsoid(29, length / 2.0, 3.2, (0, length / 2.0 + 32, 0))
    leaf.rotate(V(0, 0, 0), V(0, 1, 0), (i % 2) * 18 - 9)
    leaf.rotate(V(0, 0, 0), V(1, 0, 0), tilt)
    leaf.rotate(V(0, 0, 0), V(0, 0, 1), ang)
    leaf.translate(V(0, 0, zb))
    leaves.append(leaf)
    stem = capsule_between((0, 0, -20), (0, 36, 0), 3.2)
    stem.rotate(V(0, 0, 0), V(1, 0, 0), tilt)
    stem.rotate(V(0, 0, 0), V(0, 0, 1), ang)
    stem.translate(V(0, 0, zb))
    stems.append(stem)
parts["leaves"] = comp(*leaves)
parts["stems"] = comp(*stems)

# notebook + pen
parts["notebook"] = rbox(150, 210, 14, 3, (0, 0, 7))
parts["notebookBand"] = box(8, 212, 15, (52, 0, 7.5))
parts["pen"] = comp(capsule_between((-60, 0, 5), (60, 0, 5), 4.5), Part.makeCone(4.5, 0.6, 14, V(64, 0, 5), V(1, 0, 0)))

# ======================================================================= ROOM PROPS
# bookshelf (pivot = floor centre, front +Y)
shelf = [rbox(26, 330, 1850, 4, (sx * 440, 0, 925)) for sx in (-1, 1)]
SHELF_Z = [12, 382, 752, 1122, 1492, 1838]
shelf += [rbox(880, 330, 26, 4, (0, 0, z)) for z in SHELF_Z]
shelf.append(box(900, 10, 1850, (0, -160, 925)))
parts["shelf"] = comp(*shelf)
books = [[] for _ in range(5)]
for si, z in enumerate(SHELF_Z[:-1]):
    x = -418.0
    stop = 410.0 if si % 2 else 230.0
    while x < stop:
        w = rng.uniform(20, 44)
        h = rng.uniform(210, 310) if si < 4 else rng.uniform(180, 260)
        d = rng.uniform(200, 250)
        b = box(w, d, h, (x + w / 2, 10 - (250 - d) / 2, z + 13 + h / 2))
        if rng.random() < 0.08 and x > -300:
            b.rotate(V(x + w, 0, z + 13), V(0, 1, 0), -14)
            x += 30
        books[rng.randrange(5)].append(b)
        x += w + 1.0
    if si % 2 == 0:  # a horizontal stack and an ornament on alternate shelves
        for k in range(4):
            books[rng.randrange(5)].append(box(rng.uniform(170, 210), 230, 30, (320, 0, z + 13 + 15 + k * 31)))
for i, bl in enumerate(books):
    parts["books%d" % i] = comp(*bl)
parts["globe"] = comp(sphere(80, (300, 0, 382 + 13 + 130)))
parts["globeStand"] = comp(cyl(50, 10, (300, 0, 395)), capsule_between((300, 0, 405), (300, 0, 440), 6),
                           torus(88, 3.5, (300, 0, 525), (1, 0, 0.3)))

# sideboard (pivot = floor centre, front +Y)
sb = rbox(1200, 450, 640, 10, (0, 0, 400))
for gx in (-200, 200):
    sb = safe(lambda: sb.cut(box(4, 10, 600, (gx, 225, 400))), sb)
parts["sideboard"] = sb
parts["sideboardTop"] = rbox(1230, 470, 30, 6, (0, 0, 735))
parts["sideboardLegs"] = comp(*[Part.makeCone(18, 12, 80, V(sx * 540, sy * 180, 0), V(0, 0, 1))
                                for sx in (-1, 1) for sy in (-1, 1)])
parts["sideboardKnobs"] = comp(*[sphere(10, (gx, 230, 560)) for gx in (-400, -230, 230, 400)])

# coffee machine (pivot = bottom centre, front +Y)
cm = rbox(200, 260, 340, 22, (0, -10, 170))
cm = safe(lambda: cm.cut(rbox(150, 110, 180, 12, (0, 125, 108))), cm)
parts["coffeeMachine"] = cm
parts["coffeeTop"] = rbox(206, 266, 18, 7, (0, -10, 348))
parts["coffeeNozzle"] = comp(cyl(26, 14, (0, 80, 184)), cyl(9, 26, (0, 80, 158)))
parts["coffeeTray"] = rbox(160, 96, 14, 5, (0, 74, 7))
parts["coffeeTank"] = rbox(84, 70, 230, 12, (0, -150, 200))
parts["coffeeButton"] = cyl(11, 5, (52, 119, 280), (0, 1, 0))
layout["coffeeMachine"] = {"cupSpot": [0, 0.016, -0.074], "nozzle": [0, 0.156, -0.080]}

# arc floor lamp (pivot = base centre; the arc reaches toward +X)
pts = [(420 - 420 * math.cos(math.radians(t)), 0, 1500 + 420 * math.sin(math.radians(t))) for t in range(0, 151, 10)]
parts["lampPole"] = comp(cyl(13, 1480, (0, 0, 22)), tube(pts, 12))
end = V(*pts[-1])
shade = Part.makeCone(185, 55, 160, V(end.x + 40, 0, end.z - 220)).cut(Part.makeCone(178, 48, 160, V(end.x + 40, 0, end.z - 226)))
parts["lampShade"] = shade
parts["lampBulb"] = sphere(42, (end.x + 40, 0, end.z - 140))
parts["lampBase"] = Part.makeCone(170, 150, 34)
layout["lamp"] = {"bulb": [(end.x + 40) / 1000.0, (end.z - 150) / 1000.0, 0]}

# window frame (pivot = bottom centre, in the wall plane XZ)
WW, WH, P = 1600, 1650, 64
# the wall is 120 mm thick (from y = 0 back to y = -120); the frame fills the whole opening
FD, FY = 150, -55
wf = [box(WW, FD, P, (0, FY, P / 2)), box(WW, FD, P, (0, FY, WH - P / 2)),
      box(P, FD, WH, (-WW / 2 + P / 2, FY, WH / 2)), box(P, FD, WH, (WW / 2 - P / 2, FY, WH / 2)),
      box(36, 60, WH, (0, -60, WH / 2)), box(WW, 60, 36, (0, -60, WH * 0.66))]
parts["windowFrame"] = comp(*wf)
parts["windowSill"] = rbox(WW + 120, 200, 34, 6, (0, 80, -17))
layout["window"] = {"size": [WW / 1000.0, WH / 1000.0], "glassZ": 0.060}

# ======================================================================= LAYOUT (three.js metres)
def T(x, y, z=0):
    return [x / 1000.0, z / 1000.0, -y / 1000.0]


layout["room"] = {"back": 2.9, "right": 2.9, "left": -2.9, "height": 2.8}
layout["place"] = {
    "desk": {"pos": T(0, 675), "rot": 0},
    "chair": {"pos": T(0, -60), "rot": 0},
    "laptop": {"pos": T(0, 484, 740), "rot": 0},
    "mug": {"pos": T(440, 410, 740), "rot": 0.4},
    "plantSmall": {"pos": T(-590, 880, 740), "rot": 0.3},
    "notebook": {"pos": T(-380, 420, 740), "rot": -0.25},
    "bookshelf": {"pos": T(1700, -2722), "rot": 0},
    "sideboard": {"pos": T(2662, -1000), "rot": math.pi / 2},
    "coffeeMachine": {"pos": T(2642, -1300, 750), "rot": math.pi / 2},
    "lamp": {"pos": T(-2450, -1700), "rot": 0.25},
    "plantFloor": {"pos": T(-2550, -2600), "rot": 0.8, "scale": 3.3},
    "window": {"pos": T(-1250, -2900, 820), "rot": 0},
}
layout["spots"] = {  # where the robot walks to: position + heading (0 = facing -Z)
    "coffee": {"pos": T(2130, -1300), "heading": -math.pi / 2},
    "window": {"pos": T(-1250, -2330), "heading": 0},
    "bookshelf": {"pos": T(1700, -2180), "heading": 0},
    "plant": {"pos": T(-2050, -2150), "heading": 0.9},
    "stretch": {"pos": T(-200, -1500), "heading": math.pi},
    "lounge": {"pos": T(1000, -650), "heading": -2.6},
}
layout["obstacles"] = [  # axis-aligned rectangles in three x/z: [minX, minZ, maxX, maxZ]
    [-0.76, -1.06, 0.76, -0.29],          # desk
    [1.24, 2.54, 2.16, 2.90],             # bookshelf
    [2.42, 0.38, 2.90, 1.62],             # sideboard
    [-2.64, 1.52, -2.26, 1.88],           # lamp base
    [-2.90, 2.35, -2.25, 2.90],           # floor plant
]


# ======================================================================= EXPORT
def tess(shape, tol):
    P, N, I = [], [], []
    for f in shape.Faces:
        m = MeshPart.meshFromShape(Shape=f, LinearDeflection=tol, AngularDeflection=0.33, Relative=False)
        pts, tris = m.Topology
        if not tris:
            continue
        base = len(P) // 3
        fn, acc = [], [V(0, 0, 0) for _ in pts]
        for p in pts:
            try:
                u, v = f.Surface.parameter(p)
                n = f.normalAt(u, v)
            except Exception:
                n = V(0, 0, 0)
            fn.append(n)
        tns = []
        for a, b, c in tris:
            tn = (pts[b] - pts[a]).cross(pts[c] - pts[a])
            for k in (a, b, c):
                acc[k] = acc[k] + tn
            tns.append(tn)
        for k, n in enumerate(fn):
            if n.Length < 0.5:
                n = acc[k]
                if n.Length > 0:
                    n.normalize()
                fn[k] = n
        for p, n in zip(pts, fn):
            P += [p.x / 1000.0, p.z / 1000.0, -p.y / 1000.0]
            N += [n.x, n.z, -n.y]
        for (a, b, c), tn in zip(tris, tns):
            if tn.dot(fn[a] + fn[b] + fn[c]) < 0:
                b, c = c, b
            I += [base + a, base + b, base + c]
    return P, N, I


def b64(fmt, data):
    return base64.b64encode(struct.pack("<%d%s" % (len(data), fmt), *data)).decode("ascii")


meshes, stats = {}, []
for name, shape in parts.items():
    tol = max(0.3, min(2.5, shape.BoundBox.DiagonalLength * 0.0032))
    P_, N_, I_ = tess(shape, tol)
    big = len(P_) // 3 > 65535
    meshes[name] = {"p": b64("f", P_), "n": b64("b", [max(-127, min(127, int(round(v * 127)))) for v in N_]),
                    "i": b64("I" if big else "H", I_), "i32": big}
    stats.append((name, len(P_) // 3, len(I_) // 3))

if not os.path.isdir(os.path.dirname(OUT)):
    os.makedirs(os.path.dirname(OUT))
with open(OUT, "w") as fh:
    json.dump({"meshes": meshes, "layout": layout}, fh, separators=(",", ":"))


# ======================================================================= FREECAD PREVIEW
DOC = "MrAgent"
if DOC in App.listDocuments():
    App.closeDocument(DOC)
doc = App.newDocument(DOC)
C = {"white": (0.95, 0.96, 0.98), "dark": (0.2, 0.21, 0.24), "chrome": (0.78, 0.8, 0.83), "glow": (0.35, 0.9, 1.0),
     "visor": (0.08, 0.1, 0.13), "wood": (0.86, 0.71, 0.52), "alu": (0.6, 0.62, 0.65), "fabric": (0.3, 0.31, 0.34),
     "mug": (0.93, 0.42, 0.3), "brown": (0.25, 0.15, 0.1), "leaf": (0.3, 0.6, 0.35), "cream": (0.94, 0.93, 0.9),
     "red": (0.85, 0.2, 0.2), "blue": (0.2, 0.4, 0.9), "yellow": (0.95, 0.75, 0.2)}
MAT = {"waistSpring": "chrome", "neck": "chrome", "elbowCaps": "chrome", "wrist": "chrome", "pistonRod": "chrome",
       "chairLift": "chrome", "lampPole": "chrome", "coffeeTop": "chrome", "coffeeNozzle": "chrome", "coffeeTray": "chrome",
       "chestLight": "glow", "earGlow": "glow", "antennaTip": "glow", "batteryLeds": "glow", "forearmLed": "glow",
       "coffeeButton": "glow", "lampBulb": "glow", "visor": "visor", "deskTop": "wood", "sideboardTop": "wood",
       "shelf": "wood", "laptopBase": "alu", "laptopLid": "alu", "chairSeat": "fabric", "chairBack": "fabric",
       "mug": "mug", "coffee": "brown", "soil": "brown", "leaves": "leaf", "stems": "leaf", "pot": "cream",
       "cableRed": "red", "cableBlue": "blue", "cableYellow": "yellow", "cableSockets": "dark", "deskFrame": "white", "windowFrame": "white",
       "windowSill": "white", "sideboard": "cream", "lampShade": "cream", "lampBase": "dark", "notebook": "blue",
       "globe": "blue", "head": "white", "torso": "white", "hips": "white", "ears": "white", "shoulderPad": "white",
       "upperArm": "white", "forearm": "white", "palm": "white", "phal1": "white", "phal2": "white", "phal3": "white",
       "thigh": "white", "shin": "white", "foot": "white", "kneeCap": "white"}
for i in range(5):
    MAT["books%d" % i] = ["red", "blue", "yellow", "leaf", "cream"][i]


def Pl(x=0, y=0, z=0, axis=(1, 0, 0), deg=0):
    return App.Placement(V(x, y, z), App.Rotation(V(*axis), deg))


def show(label, part, placement):
    o = doc.addObject("Part::Feature", label)
    o.Shape = parts[part].copy()
    o.Placement = placement.multiply(parts[part].Placement)
    try:
        o.ViewObject.ShapeColor = C[MAT.get(part, "dark")]
    except Exception:
        pass


waist = Pl(0, 0, 550) * Pl(axis=(1, 0, 0), deg=-7)
for n in ("waistCore", "waistSpring", "hips", "hipJoints"):
    show(n, n, Pl(0, 0, 550))
for n in ("torso", "torsoSeam", "chestLight", "chestRing", "backpack", "batteryLeds", "backVent"):
    if n in parts:
        show(n, n, waist)
neck = waist * Pl(0, 0, 470)
for n in ("neckCollar", "neck", "neckRings", "cableRed", "cableBlue", "cableYellow"):
    show(n, n, neck)
head = neck * Pl(0, 0, 74) * Pl(axis=(1, 0, 0), deg=-12)
for n in ("head", "visor", "ears", "earGlow", "cableSockets", "antenna", "antennaTip"):
    show(n, n, head)
for side in (1, -1):
    s = "R" if side > 0 else "L"
    sh = waist * Pl(side * 218, 0, 360) * Pl(axis=(1, 0, 0), deg=38) * Pl(axis=(0, 1, 0), deg=side * 16)
    for n in ("shoulderPad", "shoulderJoint", "upperArm", "pistonBody"):
        show(n + s, n, sh if n != "pistonBody" else sh * Pl(0, 58, -140))
    el = sh * Pl(0, 0, -282) * Pl(axis=(1, 0, 0), deg=64)
    for n in ("elbowJoint", "elbowCaps", "forearm", "forearmLed"):
        show(n + s, n, el)
    wr = el * Pl(0, 0, -262) * Pl(axis=(1, 0, 0), deg=-24)
    for n in ("wrist", "palm", "palmPad"):
        show(n + s, n, wr)
    for k, x in enumerate((-27, -9, 9, 27)):
        f1 = wr * Pl(x, 4, -92) * Pl(axis=(1, 0, 0), deg=18)
        f2 = f1 * Pl(0, 0, -34) * Pl(axis=(1, 0, 0), deg=24)
        f3 = f2 * Pl(0, 0, -26) * Pl(axis=(1, 0, 0), deg=18)
        for lbl, pl, n in (("a", f1, "phal1"), ("b", f2, "phal2"), ("c", f3, "phal3")):
            show("finger%s%d%s" % (s, k, lbl), n, pl)
            show("joint%s%d%s" % (s, k, lbl), "fingerJoint", pl)
    hip = Pl(side * 95, 0, 410) * Pl(axis=(1, 0, 0), deg=90)
    show("thigh" + s, "thigh", hip)
    kn = hip * Pl(0, 0, -290) * Pl(axis=(1, 0, 0), deg=-90)
    for n in ("kneeJoint", "kneeCap", "shin"):
        show(n + s, n, kn)
    an = kn * Pl(0, 0, -330)
    for n in ("ankle", "foot", "sole"):
        show(n + s, n, an)

desk = Pl(0, 675, 0)
for n in ("deskTop", "deskFrame", "cableTray"):
    show(n, n, desk)
for n in ("chairBase", "chairWheels", "chairLift", "chairSeat", "chairBack", "chairFrame", "chairArms"):
    show(n, n, Pl(0, -60, 0))
lap = Pl(0, 484, 740)
for n in ("laptopBase", "laptopHinge", "keys"):
    show(n, n, lap)
show("laptopLid", "laptopLid", lap * Pl(0, 121, 14.5) * Pl(axis=(1, 0, 0), deg=-14))
for n in ("mug", "coffee"):
    show(n, n, Pl(440, 410, 740))
for n in ("pot", "soil", "leaves", "stems"):
    show(n, n, Pl(-590, 880, 740))
for n in ("notebook", "notebookBand"):
    show(n, n, Pl(-380, 420, 740) * Pl(axis=(0, 0, 1), deg=-14))
bs = Pl(1700, -2722, 0)
for n in ["shelf", "globe", "globeStand"] + ["books%d" % i for i in range(5)]:
    show(n, n, bs)
sbp = Pl(2662, -1000, 0) * Pl(axis=(0, 0, 1), deg=90)
for n in ("sideboard", "sideboardTop", "sideboardLegs", "sideboardKnobs"):
    show(n, n, sbp)
cmp_ = Pl(2642, -1300, 750) * Pl(axis=(0, 0, 1), deg=90)
for n in ("coffeeMachine", "coffeeTop", "coffeeNozzle", "coffeeTray", "coffeeTank", "coffeeButton"):
    show(n, n, cmp_)
lp = Pl(-2450, -1700, 0) * Pl(axis=(0, 0, 1), deg=math.degrees(0.25))
for n in ("lampBase", "lampPole", "lampShade", "lampBulb"):
    show(n, n, lp)
for n in ("windowFrame", "windowSill"):
    show(n, n, Pl(-1250, -2900, 820))

doc.recompute()
try:
    import FreeCADGui as Gui
    Gui.ActiveDocument.ActiveView.viewIsometric()
    Gui.SendMsgToActiveView("ViewFit")
except Exception:
    pass
doc.saveAs(os.path.join(HERE, "mr_agent.FCStd"))

print("exported %d parts, %d verts, %d tris -> %s (%.0f KB)" % (
    len(stats), sum(s[1] for s in stats), sum(s[2] for s in stats), OUT, os.path.getsize(OUT) / 1024.0))
for s in stats:
    print("  %-15s %6d v %6d t" % s)
