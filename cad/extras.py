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

# ======================================================================= OUTSIDE: porch, bench, mailbox
G = -0.3  # garden ground level (the house stands on a 0.3 m plinth)
# porch steps down from the front door (origin on the ground at the plinth edge, steps run along +X)
parts["porchSteps"] = comp(box(420, 1700, 200, (210, 0, 100)), box(840, 1700, 100, (420, 0, 50)))
parts["porchMat"] = rbox(700, 1000, 8, 3, (-350, 0, 304))
# garden bench (front = +Y, seat top at 450)
slats = [rbox(1500, 80, 30, 8, (0, 170 - i * 95, 435)) for i in range(4)]
backs = [rbox(1500, 30, 80, 8, (0, -210, 560 + i * 110)) for i in range(3)]
parts["benchWood"] = comp(*slats, *backs)
parts["benchIron"] = comp(*[comp(box(40, 460, 40, (sx * 690, 0, 400)), box(40, 40, 420, (sx * 690, 200, 210)), box(40, 40, 840, (sx * 690, -200, 420)),
                                rbox(60, 380, 40, 15, (sx * 690, 20, 640))) for sx in (1, -1)])
# mailbox on a post
parts["mailboxPost"] = comp(box(90, 90, 1050, (0, 0, 525)))
parts["mailboxBox"] = comp(rbox(240, 460, 220, 20, (0, 0, 1150)), cyl(120, 460, (0, -230, 1240), (0, 1, 0)))
parts["mailboxFlag"] = comp(box(14, 14, 220, (140, 60, 1250)), box(14, 120, 70, (140, 120, 1325)))

# ======================================================================= DELIVERIES
# delivery drone (origin at its centre)
parts["droneBody"] = comp(rbox(300, 300, 110, 40, (0, 0, 0)), ellipsoid(110, 110, 50, (0, 0, 60)))
arms = []
for i in range(4):
    a = math.radians(45 + 90 * i)
    arms.append(capsule_between((0, 0, 0), (290 * math.cos(a), 290 * math.sin(a), 20), 16))
parts["droneArms"] = comp(*arms, *[cyl(30, 60, (290 * math.cos(math.radians(45 + 90 * i)), 290 * math.sin(math.radians(45 + 90 * i)), -10)) for i in range(4)])
parts["droneRotor"] = comp(box(260, 22, 4, (0, 0, 0)), box(22, 260, 4, (0, 0, 0)), cyl(14, 16, (0, 0, -8)))
layout["droneRotors"] = [[0.29 * math.cos(math.radians(45 + 90 * i)), 0.055, -0.29 * math.sin(math.radians(45 + 90 * i))] for i in range(4)]
parts["droneLegs"] = comp(*[box(16, 16, 140, (sx * 110, sy * 110, -110)) for sx in (1, -1) for sy in (1, -1)], *[box(16, 300, 16, (sx * 110, 0, -180)) for sx in (1, -1)])
parts["droneLights"] = comp(sphere(14, (0, 160, 0)), *[sphere(10, (290 * math.cos(math.radians(45 + 90 * i)), 290 * math.sin(math.radians(45 + 90 * i)), 30)) for i in range(4)])
# parcel (origin at the bottom centre; the lid flaps hinge on the top edges)
parts["parcel"] = rbox(360, 280, 260, 6, (0, 0, 130))
parts["parcelTape"] = comp(box(364, 60, 4, (0, 0, 262)), box(60, 284, 4, (0, 0, 262)), box(364, 6, 262, (0, 141, 131)))
parts["parcelLabel"] = box(130, 4, 90, (90, 142, 150))
parts["parcelFlap"] = box(360, 140, 6, (0, -70, 0))  # hinge along its own x axis, at y = 0
layout["parcel"] = {"size": [0.36, 0.26, 0.28]}

# ---- things you can order (each modelled around its base)
parts["duckBody"] = comp(ellipsoid(70, 90, 55, (0, 0, 55)), ellipsoid(45, 45, 45, (0, 45, 135)))
parts["duckBeak"] = ellipsoid(22, 28, 10, (0, 92, 130))
parts["duckEyes"] = comp(sphere(7, (20, 80, 150)), sphere(7, (-20, 80, 150)))
parts["tinBody"] = cyl(45, 120, (0, 0, 0))
parts["tinLid"] = comp(cyl(47, 25, (0, 0, 115)), cyl(20, 8, (0, 0, 140)))
parts["tinLabel"] = cyl(46, 50, (0, 0, 35))
parts["pizzaBox"] = rbox(330, 330, 45, 4, (0, 0, 22.5))
parts["pizzaTop"] = comp(cyl(120, 2, (0, 0, 45)), *[cyl(14, 3, (60 * math.cos(i * 1.3), 60 * math.sin(i * 1.3), 46)) for i in range(6)])
parts["usbBody"] = rbox(70, 22, 12, 4, (0, 0, 6))
parts["usbPlug"] = box(26, 14, 9, (48, 0, 6))
parts["batteryPack"] = rbox(140, 80, 200, 12, (0, 0, 100))
parts["batteryPackTop"] = comp(cyl(14, 14, (35, 0, 200)), cyl(14, 14, (-35, 0, 200)), box(100, 82, 30, (0, 0, 130)))
parts["trophyCup"] = comp(Part.makeCone(30, 75, 110, V(0, 0, 120), V(0, 0, 1)), torus(30, 6, (78, 0, 190), (0, 1, 0)), torus(30, 6, (-78, 0, 190), (0, 1, 0)), cyl(10, 70, (0, 0, 50)))
parts["trophyBase"] = comp(rbox(120, 120, 50, 8, (0, 0, 25)))
balloons = []
strings = []
for i, (bx, by, bz) in enumerate(((0, 0, 1150), (160, 60, 1050), (-150, -40, 1000))):
    balloons.append(ellipsoid(110, 110, 140, (bx, by, bz)))
    strings.append(tube([(0, 0, 40), (bx * 0.5, by * 0.5, (bz - 140) * 0.55), (bx, by, bz - 140)], 2.5))
parts["balloons"] = comp(*balloons)
parts["balloonStrings"] = comp(*strings, cyl(35, 40, (0, 0, 0)))
parts["sparePartsBox"] = comp(rbox(300, 200, 140, 10, (0, 0, 70)), box(120, 30, 20, (0, 0, 150)))

layout["shop"] = {
    "porchDrop": [10.3, G, -3.2],
}

# ======================================================================= garden placement
for it in house["furniture"]:
    if it["name"] == "stones":  # lay them on the ground, running out from the front door steps
        it["pos"] = [9.95, G, -3.2]
        it["rot"] = 0
house["furniture"] += [
    {"name": "porchSteps", "pos": [8.8, G, -3.2], "rot": 0, "scale": 1, "solid": False, "tag": None, "parts": [["porchSteps", "stone"]]},
    {"name": "porchMat", "pos": [8.8, G, -3.2], "rot": 0, "scale": 1, "solid": False, "tag": None, "parts": [["porchMat", "rug"]]},
    {"name": "gardenBench", "pos": [12.4, G, -0.6], "rot": math.pi / 2, "scale": 1, "solid": False, "tag": "gardenBench", "parts": [["benchWood", "wood"], ["benchIron", "steelDark"]]},
    {"name": "mailbox", "pos": [12.6, G, -4.35], "rot": math.pi / 2, "scale": 1, "solid": False, "tag": "mailbox", "parts": [["mailboxPost", "woodDark"], ["mailboxBox", "red"], ["mailboxFlag", "steel"]]},
]
house["obstacles"] += [[12.15, -1.4, 12.65, 0.2], [12.5, -4.5, 12.7, -4.2]]
# tree trunks block the way (the canopies don't)
for it in house["furniture"]:
    if it["name"].startswith("tree"):
        x, z = it["pos"][0], it["pos"][2]
        house["obstacles"].append([x - 0.25, z - 0.25, x + 0.25, z + 0.25])
house["outside"] = {"ground": G, "plinth": 0.3, "bounds": [-13.5, -12.5, 14.5, 8.5], "door": [8.5, -3.2]}
house["spots"].update({
    "frontPorch": spot(10.05, -3.2, -math.pi / 2),
    "pickup": spot(9.75, -3.2, -math.pi / 2),
    "gardenBench": spot(12.12, -0.6, math.pi / 2, seat=0.45),
    "mailbox": spot(11.95, -4.35, -math.pi / 2),
    "garden": spot(11.0, 2.3, -math.pi / 2),
    "backyard": spot(0.0, 5.6, math.pi),
    "sideYard": spot(-11.2, -3.0, math.pi / 2),
})
