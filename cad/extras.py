"""Breakable insides for Mr. Agent, plus Kuma's Windows corner. Executed by build_models.py after house.py.

1. The torso becomes a hollow shell with a detachable chest plate. Behind it sit the
   things you see when he gets punched open: spine, reactor core, battery cells,
   circuit boards, shoulder servos and a loom of coloured wires (all in the torso
   frame: pivot = waist, robot faces +Y).
2. A gaming desk, gaming chair and an RGB tower PC for Kuma in the living room
   (furniture convention: front = +Y = the side Kuma sits on).
"""

# ======================================================================= ROBOT INSIDES
# Hollow the torso by cutting out a 90 % copy of itself, then lift the chest plate out of the front.
inner = parts["torso"].copy()
inner.scale(0.9, V(0, 0, 240))
shell = safe(lambda: parts["torso"].cut(inner), parts["torso"])
PLATE = box(300, 240, 260, (0, 160, 300))  # x +-150, y 40..280, z 170..430
plate = safe(lambda: shell.common(PLATE), None)
body = safe(lambda: shell.cut(PLATE), shell)
if plate is not None and body is not shell:
    parts["torso"] = body
    parts["chestPlate"] = plate
    layout["chestPlate"] = {"centre": T(0, 140, 300)}

# spine with vertebra discs
parts["spineCore"] = comp(cyl(20, 440, (0, -70, 20)), *[cyl(36, 12, (0, -70, z)) for z in range(40, 450, 45)])
# glowing reactor core behind the chest light, in a little gimbal cage
parts["coreGlow"] = sphere(44, (0, 55, 300))
parts["coreCage"] = comp(torus(58, 4, (0, 55, 300), (1, 0, 0)), torus(58, 4, (0, 55, 300), (0, 0, 1)), torus(58, 4, (0, 55, 300), (0, 1, 0)),
                         cyl(10, 50, (0, 55, 240), (0, 0, -1)))
# battery cells with chrome terminals
parts["batteryCells"] = comp(*[cyl(34, 140, (sx * 100, -40, 70)) for sx in (1, -1)])
parts["batteryCaps"] = comp(*[cyl(13, 10, (sx * 100, -40, 210)) for sx in (1, -1)], *[cyl(36, 6, (sx * 100, -40, 64)) for sx in (1, -1)])
# circuit boards (green) with chips (black)
parts["pcbBoards"] = comp(box(200, 5, 95, (0, 100, 175)), box(5, 100, 120, (150, -10, 300)), box(5, 100, 120, (-150, -10, 300)))
chips = [box(30, 6, 26, (x, 106, z)) for x, z in ((-60, 160), (-15, 195), (45, 165), (70, 200))]
chips += [box(6, 26, 22, (sx * 144, y, z)) for sx in (1, -1) for y, z in ((-30, 270), (15, 320), (-20, 345))]
parts["pcbChips"] = comp(*chips)
# shoulder servos
parts["servos"] = comp(*[rbox(48, 56, 44, 6, (sx * 148, -10, 372)) for sx in (1, -1)],
                       *[cyl(14, 22, (sx * 160, -10, 372), (sx, 0, 0)) for sx in (1, -1)])
# the wire loom
CORE = (0, 55, 300)
WIRES = {
    "wireRed": [[CORE, (55, 35, 345), (110, 5, 372), (125, -10, 372)], [(100, -40, 215), (60, 20, 240), (25, 45, 262)]],
    "wireBlue": [[CORE, (-55, 35, 345), (-110, 5, 372), (-125, -10, 372)], [(-100, -40, 215), (-60, 20, 240), (-25, 45, 262)]],
    "wireYellow": [[(10, 40, 350), (15, 0, 400), (12, -30, 448)], [(-60, 100, 215), (-110, 60, 260), (-146, 10, 290)]],
    "wireBlack": [[(-10, 40, 350), (-15, 0, 400), (-12, -40, 448)], [(80, 100, 180), (115, 50, 240), (146, -10, 270)], [(0, -40, 30), (0, 20, 80), (0, 95, 128)]],
}
for name, runs in WIRES.items():
    parts[name] = comp(*[tube(r, 6) for r in runs])

# ======================================================================= KUMA'S WINDOWS CORNER
# ---- gaming desk (top at 750)
parts["winDeskTop"] = rbox(1400, 720, 30, 6, (0, 0, 735))
parts["winDeskFrame"] = comp(*[rbox(60, 640, 40, 8, (sx * 640, 0, 20)) for sx in (1, -1)],
                             *[box(60, 50, 680, (sx * 640, -40, 380)) for sx in (1, -1)],
                             *[box(80, 600, 30, (sx * 640, 0, 705)) for sx in (1, -1)],
                             box(1220, 40, 60, (0, -240, 640)))
parts["winDeskRgb"] = comp(box(1360, 6, 8, (0, 361, 726)), box(6, 640, 8, (697, 0, 726)), box(6, 640, 8, (-697, 0, 726)))
parts["winMousepad"] = rbox(900, 320, 3, 1.4, (60, 205, 751.5))
parts["winKeyboard"] = rbox(440, 140, 22, 6, (-40, 225, 764))
caps = []
for row in range(5):
    for col in range(15):
        caps.append(box(22, 21, 8, (-40 - 182 + col * 26, 225 - 52 + row * 26, 779)))
parts["winKeycaps"] = comp(*caps)
parts["winMouse"] = comp(ellipsoid(32, 56, 20, (310, 225, 753)))
parts["winMouseRgb"] = box(4, 30, 3, (310, 190, 771))
# monitor (screen exported for the app; it faces +Y)
parts["winMonitor"] = comp(rbox(640, 26, 380, 8, (0, -210, 1080)), rbox(380, 60, 220, 20, (0, -248, 1070)),
                           box(60, 30, 300, (0, -268, 880)), rbox(280, 220, 12, 4, (0, -240, 756)))
layout["winPC"] = {"screen": T(0, -196.5, 1080), "size": [0.604, 0.344]}
parts["winCan"] = comp(cyl(33, 120, (-560, 120, 750)), cyl(26, 6, (-560, 120, 870)))
parts["winSpeakers"] = comp(*[rbox(90, 90, 170, 10, (sx * 430, -200, 835)) for sx in (1, -1)])
parts["winSpeakerCones"] = comp(*[cyl(30, 4, (sx * 430, -155, 850), (0, 1, 0)) for sx in (1, -1)])

# ---- RGB tower (front = +Y, glass front panel)
parts["winTower"] = comp(rbox(220, 460, 480, 10, (0, 0, 270)), *[cyl(14, 30, (sx * 80, sy * 190, 0)) for sx in (1, -1) for sy in (1, -1)])
parts["winTowerGlass"] = box(186, 4, 430, (0, 232, 270))
parts["winTowerFans"] = comp(*[torus(70, 7, (0, 224, z), (0, 1, 0)) for z in (130, 270, 410)])
parts["winTowerHub"] = comp(*[cyl(22, 6, (0, 220, z), (0, 1, 0)) for z in (130, 270, 410)])

# ---- gaming chair (Kuma sits facing -Y, so the backrest is on +Y)
star = []
for i in range(5):
    a = math.radians(90 + i * 72)
    b = box(300, 50, 30, (150, 0, 60))
    b.rotate(V(0, 0, 0), V(0, 0, 1), math.degrees(a))
    star.append(b)
parts["gchairBase"] = comp(*star, *[sphere(26, (300 * math.cos(math.radians(90 + i * 72)), 300 * math.sin(math.radians(90 + i * 72)), 26)) for i in range(5)])
parts["gchairLift"] = comp(cyl(26, 330, (0, 0, 70)), cyl(40, 30, (0, 0, 380)))
parts["gchairSeat"] = comp(rbox(500, 480, 80, 25, (0, 0, 420)), rbox(500, 90, 760, 40, (0, 270, 860)),
                           rbox(260, 50, 130, 18, (0, 220, 1130)),
                           *[box(60, 260, 26, (sx * 285, 30, 660)) for sx in (1, -1)])
parts["gchairTrim"] = comp(*[rbox(70, 110, 700, 30, (sx * 222, 265, 860)) for sx in (1, -1)],
                           *[rbox(70, 460, 70, 30, (sx * 222, 0, 470)) for sx in (1, -1)],
                           *[cyl(18, 190, (sx * 285, 60, 465)) for sx in (1, -1)])

PI = math.pi
DESK_Z = 2.54
house["furniture"] += [
    {"name": "winDesk", "pos": [5.0, 0, DESK_Z], "rot": 0, "scale": 1, "solid": True, "tag": "winDesk",
     "parts": [["winDeskTop", "deskBlack"], ["winDeskFrame", "steelDark"], ["winDeskRgb", "rgb"], ["winMousepad", "rubber"],
               ["winKeyboard", "plasticDark"], ["winKeycaps", "rgbKeys"], ["winMouse", "plasticDark"], ["winMouseRgb", "rgb"],
               ["winMonitor", "plasticDark"], ["winCan", "red"], ["winSpeakers", "plasticDark"], ["winSpeakerCones", "rubber"]]},
    {"name": "winTower", "pos": [5.85, 0, 2.62], "rot": 0, "scale": 1, "solid": True, "tag": "winTower",
     "parts": [["winTower", "plasticDark"], ["winTowerGlass", "smokedGlass"], ["winTowerFans", "rgb"], ["winTowerHub", "plasticDark"]]},
    {"name": "kumaChair", "pos": [5.0, 0, DESK_Z - 0.56], "rot": 0, "scale": 1, "solid": True, "tag": "kumaChair",
     "parts": [["gchairBase", "plasticDark"], ["gchairLift", "chrome"], ["gchairSeat", "plasticDark"], ["gchairTrim", "red"]]},
]
for it in house["furniture"][-3:]:
    house["obstacles"].append(footprint(it))
house["spots"]["kuma"] = spot(5.95, 1.75, PI / 2 - 0.35)
layout["kuma"] = {"chair": [5.0, 0, DESK_Z - 0.56], "seat": 0.4}

# ======================================================================= HIS BRAIN (head frame, visible in x-ray mode)
BRAIN_C = (0, -22, 168)
hemis = [ellipsoid(50, 68, 50, (sx * 27, BRAIN_C[1], BRAIN_C[2])) for sx in (1, -1)]
parts["brainLobes"] = comp(*hemis)
folds = []
for sx in (1, -1):
    cx = sx * 27
    for k, lat in enumerate((-0.55, -0.15, 0.25, 0.6)):
        pts = []
        for i in range(19):
            a = math.pi * 2 * i / 18
            r = math.cos(lat * math.pi / 2) * 1.03
            wob = 1 + 0.06 * math.sin(a * 5 + k)
            pts.append((cx + sx * 50 * r * abs(math.cos(a)) * 0.55 * wob, BRAIN_C[1] + 68 * r * math.sin(a) * wob,
                        BRAIN_C[2] + 50 * math.sin(lat * math.pi / 2) * 1.03 + 6 * math.sin(a * 3 + k)))
        clean = [pts[0]]
        for q in pts[1:]:
            if math.dist(q, clean[-1]) > 1.0:
                clean.append(q)
        folds.append(tube(clean, 3.2))
parts["brainFolds"] = comp(*folds)
parts["brainStem"] = comp(cyl(15, 50, (0, -34, 82)), sphere(18, (0, -34, 132)))
rngb = random.Random(3)
nodes = []
for i in range(26):
    sx = 1 if i % 2 else -1
    a, b = rngb.uniform(0, math.pi * 2), rngb.uniform(-1.1, 1.1)
    nodes.append(sphere(4.5, (sx * 27 + sx * 52 * abs(math.cos(b) * math.cos(a)), BRAIN_C[1] + 70 * math.cos(b) * math.sin(a), BRAIN_C[2] + 52 * math.sin(b))))
parts["brainNodes"] = comp(*nodes)
layout["brain"] = {"centre": T(BRAIN_C[0], BRAIN_C[1], BRAIN_C[2])}
