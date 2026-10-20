"""The rest of Mr. Agent's house, executed inside build_models.py (shares its helpers).

Plan (three.js metres, x right, z back; the office is the room in the middle):

      x: -9 ............ -2.9 ............ 2.9 ............ 8.5
 z 2.9 +-----------------+-----------------+----------------+
       |   KITCHEN +     |     OFFICE      |  LIVING ROOM   |
       |   DINING        |  (Mr. Agent's   |                |
       |                 |   desk)         |                |
 -2.4  +----door---------+--door-----------+---arch---------+
       |                    HALLWAY                    front door
 -4.0  +----------door--------+--door------+----door--------+
       |   BEDROOM            |  BATHROOM  |   WORKSHOP     |
 -8.5  +----------------------+------------+----------------+
"""

FINE_PARTS = set(parts)  # robot + office: meshed finely; everything added below is meshed coarser
H_WALL = 2.8
WALL_T = 0.12

# wall segments: (x1, z1, x2, z2, [(from, to, bottom, top, kind)]) - openings are distances along the segment
house = {
    "bounds": [-9.0, -8.5, 8.5, 2.96],
    "height": H_WALL,
    "thickness": WALL_T,
    "walls": [
        # exterior
        (-9.0, 2.96, 8.5, 2.96, [(1.8, 3.6, 0.95, 2.2, "window"), (6.95, 8.55, 0.82, 2.47, "window"), (13.0, 16.6, 0.5, 2.4, "window")]),
        (-9.0, -8.5, 8.5, -8.5, [(2.5, 4.5, 0.9, 2.2, "window"), (9.4, 10.4, 1.3, 2.0, "window"), (14.0, 16.0, 0.9, 2.2, "window")]),
        (-9.0, -8.5, -9.0, 2.96, [(8.0, 9.5, 0.95, 2.2, "window")]),
        (8.5, -8.5, 8.5, 2.96, [(4.8, 5.8, 0.0, 2.15, "door"), (8.7, 10.3, 0.9, 2.2, "window")]),
        # interior
        (-2.96, -2.4, -2.96, 2.96, [(0.25, 1.3, 0.0, 2.15, "door")]),
        (2.96, -2.4, 2.96, 2.96, [(0.25, 1.3, 0.0, 2.15, "door")]),
        (-9.0, -2.4, 8.5, -2.4, [(2.4, 3.5, 0.0, 2.15, "door"), (6.5, 7.6, 0.0, 2.15, "door"), (13.2, 15.4, 0.0, 2.4, "arch")]),
        (-9.0, -4.0, 8.5, -4.0, [(5.7, 6.8, 0.0, 2.15, "door"), (9.2, 10.2, 0.0, 2.15, "door"), (13.6, 14.7, 0.0, 2.15, "door")]),
        (-1.0, -8.5, -1.0, -4.0, []),
        (3.0, -8.5, 3.0, -4.0, []),
    ],
    "rooms": [
        {"id": "office", "name": "Office", "rect": [-2.96, -2.4, 2.96, 2.96], "floor": "oak"},
        {"id": "kitchen", "name": "Kitchen", "rect": [-9.0, -2.4, -2.96, 2.96], "floor": "tile"},
        {"id": "living", "name": "Living Room", "rect": [2.96, -2.4, 8.5, 2.96], "floor": "oak"},
        {"id": "hallway", "name": "Hallway", "rect": [-9.0, -4.0, 8.5, -2.4], "floor": "walnut"},
        {"id": "bedroom", "name": "Bedroom", "rect": [-9.0, -8.5, -1.0, -4.0], "floor": "carpet"},
        {"id": "bathroom", "name": "Bathroom", "rect": [-1.0, -8.5, 3.0, -4.0], "floor": "bathtile"},
        {"id": "workshop", "name": "Workshop", "rect": [3.0, -8.5, 8.5, -4.0], "floor": "concrete"},
    ],
}

# ======================================================================= FURNITURE PARTS (FreeCAD mm, front = +Y)
def legs4(w, d, h, r=18, inset=60, taper=0.8):
    leg = (lambda p: cyl(r, h, p)) if abs(taper - 1) < 1e-6 else (lambda p: Part.makeCone(r, r * taper, h, V(*p), V(0, 0, 1)))
    return comp(*[leg((sx * (w / 2 - inset), sy * (d / 2 - inset), 0)) for sx in (-1, 1) for sy in (-1, 1)])


def door_grooves(shape, xs, y_front, z0, z1, depth=3):
    for gx in xs:
        shape = safe(lambda: shape.cut(box(4, 10, z1 - z0, (gx, y_front, (z0 + z1) / 2))), shape)
    return shape


# ---- sofa (seat top ~580)
def sofa_parts(w):
    frame = comp(rbox(w, 850, 300, 40, (0, 0, 200)), rbox(w, 220, 560, 60, (0, -315, 500)),
                 rbox(200, 850, 520, 60, (-w / 2 + 100, 0, 290)), rbox(200, 850, 520, 60, (w / 2 - 100, 0, 290)))
    n = max(1, int(round((w - 400) / 640.0)))
    cw = (w - 400) / n
    seats = [rbox(cw - 16, 640, 150, 50, (-w / 2 + 200 + cw * (i + 0.5), 60, 420)) for i in range(n)]
    backs = [rbox(cw - 16, 190, 430, 70, (-w / 2 + 200 + cw * (i + 0.5), -210, 660)) for i in range(n)]
    return frame, comp(*seats, *backs), legs4(w - 120, 760, 60, 16)


parts["sofaFrame"], parts["sofaCushions"], parts["sofaLegs"] = sofa_parts(2300)
pillows = []
for sx, ang in ((-1, 12), (1, -14)):
    p = rbox(420, 140, 420, 60, (0, 0, 0))
    p.rotate(V(0, 0, 0), V(0, 1, 0), ang)
    p.rotate(V(0, 0, 0), V(1, 0, 0), -18)
    p.translate(V(sx * 800, -120, 680))
    pillows.append(p)
parts["sofaPillows"] = comp(*pillows)
parts["armchairFrame"], parts["armchairCushions"], parts["armchairLegs"] = sofa_parts(1000)

# ---- coffee table
parts["coffeeTableTop"] = comp(rbox(1200, 650, 40, 12, (0, 0, 420)), rbox(1080, 540, 20, 6, (0, 0, 150)))
parts["coffeeTableLegs"] = legs4(1200, 650, 400, 20, 70, 0.9)
parts["tableBooks"] = comp(box(260, 190, 34, (-300, 40, 457)), box(240, 170, 30, (-300, 40, 489)), box(200, 150, 26, (-300, 40, 517)))

# ---- TV + stand (screen centre exported for the app)
tvs = rbox(1800, 450, 470, 10, (0, 0, 315))
tvs = door_grooves(tvs, (-300, 300), 225, 120, 510)
parts["tvStand"] = tvs
parts["tvStandLegs"] = legs4(1700, 380, 80, 14, 40)
parts["tvPanel"] = comp(rbox(1660, 45, 960, 8, (0, -100, 1080)), rbox(300, 200, 16, 6, (0, -60, 558)), box(70, 30, 120, (0, -110, 620)))
layout["tv"] = {"screen": [0, 1.080, 0.0775], "size": [1.60, 0.90]}

# ---- kitchen counter run (4.9 m) with sink + hob, upper cabinets, fridge
KL = 4900
base = rbox(KL, 600, 860, 8, (0, 0, 470))
base = safe(lambda: base.cut(box(KL + 40, 80, 100, (0, 290, 50))), base)  # toe kick
base = door_grooves(base, [-KL / 2 + 600 * i for i in range(1, 9)], 300, 120, 880)
parts["kitchenBase"] = base
top = rbox(KL + 40, 640, 40, 6, (0, 10, 920))
sink_cut = rbox_v(600, 420, 200, 30, (150, 20, 900))
parts["kitchenTop"] = safe(lambda: top.cut(sink_cut), top)
basin = rbox_v(620, 440, 220, 34, (150, 20, 830))
parts["kitchenSink"] = safe(lambda: basin.cut(rbox_v(580, 400, 220, 28, (150, 20, 850))), basin)
parts["kitchenFaucet"] = comp(cyl(18, 60, (150, -230, 940)), tube([(150, -230, 1000), (150, -230, 1240), (150, -150, 1290), (150, -60, 1240), (150, -40, 1150)], 13))
parts["kitchenHob"] = comp(rbox(600, 520, 8, 3, (1750, 10, 944)))
parts["kitchenBurners"] = comp(*[torus(70 if i % 2 else 95, 6, (1750 + dx, 10 + dy, 950)) for i, (dx, dy) in enumerate(((-140, -110), (140, -110), (-140, 120), (140, 120)))])
parts["kitchenOven"] = comp(rbox(560, 14, 470, 5, (1750, 306, 450)))
uppers = comp(rbox(950, 350, 760, 8, (-KL / 2 + 475, -125, 1830)), rbox(1550, 350, 760, 8, (KL / 2 - 775, -125, 1830)))
parts["kitchenUppers"] = uppers
handles = [capsule_between((-KL / 2 + 600 * i + 300 - 120, 312, 820), (-KL / 2 + 600 * i + 300 + 120, 312, 820), 7) for i in range(8) if abs(-KL / 2 + 600 * i + 300 - 1750) > 100]
handles += [capsule_between((x, 62, 1500), (x, 62, 1620), 6) for x in (-KL / 2 + 300, -KL / 2 + 750, KL / 2 - 1300, KL / 2 - 850, KL / 2 - 400)]
handles.append(capsule_between((1550, 330, 650), (1950, 330, 650), 9))
parts["kitchenHandles"] = comp(*handles)
parts["rangeHood"] = comp(Part.makeCone(380, 120, 260, V(1750, -60, 1580), V(0, 0, 1)), cyl(110, 900, (1750, -60, 1840)))

# fridge (pivot = floor centre); the main door is a separate part hinged on its right edge
fb = rbox(800, 700, 1900, 18, (0, 0, 950))
fb = safe(lambda: fb.cut(box(700, 640, 1080, (0, 40, 1290))), fb)
parts["fridgeBody"] = fb
parts["fridgeShelves"] = comp(*[box(690, 600, 8, (0, 40, z)) for z in (1000, 1260, 1520)])
parts["fridgeLight"] = box(300, 20, 14, (0, -270, 1820))
cans = []
for i, (fx, fy) in enumerate(((-220, 100), (-140, 140), (-60, 100), (120, 60), (200, 120))):
    cans.append(cyl(32, 120, (fx, fy, 1008)))
parts["fridgeCans"] = comp(*cans)
parts["fridgeFreezer"] = comp(rbox(780, 50, 640, 14, (0, 352, 380)), capsule_between((-300, 392, 640), (300, 392, 640), 10))
# door: pivot at the hinge (right front corner, x = +390, y = 350), door spans x -780..0 in its own frame
parts["fridgeDoor"] = comp(rbox(780, 50, 1160, 14, (-390, 25, 1290)), capsule_between((-720, 66, 900), (-720, 66, 1500), 11))
layout["fridge"] = {"hinge": [0.390, 0, -0.350]}

# dining table + chair
parts["diningTop"] = rbox(1600, 900, 40, 12, (0, 0, 740))
parts["diningLegs"] = legs4(1600, 900, 720, 26, 90, 0.7)
parts["chairWood"] = comp(rbox(450, 440, 40, 10, (0, 0, 460)), rbox(450, 30, 430, 10, (0, -205, 730)), legs4(420, 410, 440, 14, 30, 0.8),
                          *[cyl(12, 450, (sx * 195, -205, 460)) for sx in (-1, 1)])
parts["fruitBowl"] = comp(safe(lambda: ellipsoid(150, 150, 70, (0, 0, 830)).cut(box(400, 400, 200, (0, 0, 930))), ellipsoid(150, 150, 70, (0, 0, 830))))
parts["fruit"] = comp(sphere(42, (-40, 20, 830)), sphere(40, (50, -10, 835)), sphere(38, (0, -60, 832)), sphere(44, (20, 60, 840)))

# ---- bed + nightstands + wardrobe
parts["bedFrame"] = comp(rbox(1700, 2150, 300, 20, (0, 0, 200)), legs4(1600, 2050, 60, 22, 40))
parts["bedHead"] = rbox(1800, 90, 1050, 40, (0, -1100, 580))
parts["mattress"] = rbox(1600, 2000, 220, 70, (0, 40, 450))
parts["blanket"] = rbox(1660, 1250, 70, 32, (0, 420, 585))
parts["pillowsBed"] = comp(rbox(620, 360, 150, 70, (-380, -800, 625)), rbox(620, 360, 150, 70, (380, -800, 625)))
parts["chargePad"] = comp(rbox(1500, 14, 40, 6, (0, -1052, 930)), rbox(600, 600, 10, 4, (0, -350, 562)))
layout["bed"] = {"mattressTop": 0.565}
parts["nightstand"] = door_grooves(rbox(500, 420, 520, 18, (0, 0, 260)), (), 210, 0, 0)
parts["nightLampBase"] = comp(cyl(70, 20, (0, 0, 520)), cyl(10, 260, (0, 0, 540)))
parts["nightLampShade"] = Part.makeCone(150, 90, 170, V(0, 0, 760)).cut(Part.makeCone(145, 85, 170, V(0, 0, 758)))
wd = rbox(1600, 600, 2100, 10, (0, 0, 1050))
parts["wardrobe"] = door_grooves(wd, (-400, 0, 400), 300, 60, 2040)
parts["wardrobeHandles"] = comp(*[capsule_between((x, 316, 950), (x, 316, 1250), 9) for x in (-60, 60, -460, 460)])

# ---- bathroom
tub = rbox(1700, 760, 560, 70, (0, 0, 280))
parts["bathtub"] = safe(lambda: tub.cut(rbox(1560, 620, 560, 180, (0, 0, 420))), tub)
parts["bathWater"] = box(1520, 580, 6, (0, 0, 430))
parts["tubFaucet"] = comp(tube([(-700, -330, 560), (-700, -330, 700), (-700, -230, 720), (-700, -190, 680)], 14))
van = rbox(1000, 520, 800, 10, (0, 0, 420))
parts["vanity"] = door_grooves(van, (0,), 260, 60, 800)
vt = rbox(1040, 540, 30, 6, (0, 0, 835))
parts["vanityTop"] = safe(lambda: vt.cut(ellipsoid(300, 190, 160, (0, 30, 850))), vt)
parts["vanityBowl"] = safe(lambda: ellipsoid(310, 200, 170, (0, 30, 850)).cut(ellipsoid(290, 180, 155, (0, 30, 852))).cut(box(800, 600, 300, (0, 30, 1000))),
                           ellipsoid(310, 200, 170, (0, 30, 850)))
parts["vanityFaucet"] = tube([(0, -210, 850), (0, -210, 1010), (0, -140, 1040), (0, -90, 1000)], 12)
parts["mirrorFrame"] = rbox(900, 30, 820, 12, (0, -245, 1650))
parts["mirrorGlass"] = rbox(840, 8, 760, 3, (0, -228, 1650))
toilet = comp(safe(lambda: ellipsoid(190, 270, 200, (0, 70, 220)).cut(box(600, 700, 400, (0, 0, 620))), ellipsoid(190, 270, 200, (0, 70, 220))),
              rbox(420, 190, 380, 30, (0, -220, 600)), cyl(140, 220, (0, 40, 0)))
parts["toilet"] = toilet
parts["toiletSeat"] = safe(lambda: ellipsoid(200, 280, 20, (0, 80, 430)).cut(ellipsoid(130, 190, 40, (0, 90, 430))), ellipsoid(200, 280, 20, (0, 80, 430)))
parts["towelRack"] = comp(capsule_between((-300, 60, 1150), (300, 60, 1150), 10), cyl(14, 60, (-300, 0, 1150), (0, 1, 0)), cyl(14, 60, (300, 0, 1150), (0, 1, 0)))
parts["towel"] = rbox(520, 60, 600, 24, (0, 70, 880))

# ---- workshop
parts["benchTop"] = rbox(2000, 750, 60, 8, (0, 0, 900))
parts["benchFrame"] = comp(*[rbox(60, 60, 870, 6, (sx * 940, sy * 330, 435)) for sx in (-1, 1) for sy in (-1, 1)],
                           rbox(1880, 680, 25, 6, (0, 0, 250)))
parts["pegboard"] = rbox(1800, 24, 900, 8, (0, -363, 1500))
tools = [capsule_between((-700 + i * 130, -340, 1650), (-700 + i * 130, -340, 1400 - (i % 3) * 60), 12) for i in range(6)]
tools += [comp(torus(40, 9, (300 + i * 140, -340, 1640), (0, 1, 0)), capsule_between((300 + i * 140, -340, 1600), (300 + i * 140, -340, 1420), 10)) for i in range(4)]
parts["tools"] = comp(*tools)
parts["vise"] = comp(rbox(160, 260, 140, 10, (-800, 230, 1000)), cyl(14, 300, (-950, 330, 1000), (1, 0, 0)))
parts["benchGadget"] = comp(rbox(320, 220, 90, 20, (250, 80, 975)), cyl(30, 60, (420, 0, 1000)), capsule_between((100, 160, 1020), (380, 210, 1020), 8))
parts["solderLamp"] = comp(cyl(60, 20, (700, -200, 930)), tube([(700, -200, 950), (700, -200, 1350), (560, -60, 1450)], 10), Part.makeCone(90, 40, 110, V(520, -20, 1360)))
parts["printerTable"] = comp(rbox(900, 700, 40, 8, (0, 0, 740)), legs4(860, 660, 720, 18, 40, 1))
pf = rbox(500, 500, 520, 14, (0, 0, 1020))
parts["printerFrame"] = safe(lambda: pf.cut(box(460, 520, 440, (0, 30, 1040))), pf)
parts["printerBed"] = comp(box(400, 400, 10, (0, 0, 860)), rbox(160, 120, 140, 30, (0, 0, 930)))
parts["printerSpool"] = comp(cyl(110, 70, (-150, -330, 1200), (0, 1, 0)))
parts["printerLed"] = box(380, 8, 10, (0, 255, 1230))
shelving = [rbox(30, 500, 1900, 4, (sx * 600, 0, 950)) for sx in (-1, 1)] + [rbox(1230, 500, 25, 4, (0, 0, z)) for z in (40, 520, 1000, 1480, 1900)]
parts["metalShelf"] = comp(*shelving)
parts["storageBoxes"] = comp(*[rbox(320, 380, 220, 10, (x, 20, z + 130)) for z in (40, 520) for x in (-380, 0, 380)])
layout["sparePartsShelf"] = {"headAt": [0.25, 1.0125, -0.02]}
chest = rbox(900, 500, 1000, 14, (0, 0, 500))
parts["toolChest"] = safe(lambda: chest, chest)
parts["toolChestDrawers"] = comp(*[capsule_between((-300, 262, z), (300, 262, z), 9) for z in (230, 430, 630, 830)])

# ---- hallway & front door
parts["consoleTable"] = comp(rbox(1200, 340, 30, 6, (0, 0, 800)), legs4(1160, 300, 785, 14, 30, 1), rbox(1120, 260, 20, 4, (0, 0, 250)))
parts["coatRack"] = comp(Part.makeCone(180, 150, 30), cyl(18, 1750, (0, 0, 30)), *[capsule_between((0, 0, 1700), (150 * math.cos(a), 150 * math.sin(a), 1760), 10) for a in (0, 2.1, 4.2)])
parts["coat"] = ellipsoid(180, 90, 420, (150, 0, 1300))
fd = rbox(1000, 50, 2120, 8, (-500, 25, 1060))
for (cx, cz) in ((-500, 1550), (-500, 600)):
    fd = safe(lambda: fd.cut(rbox_v(700, 10, 700 if cz > 1000 else 760, 4, (cx, 52, cz))), fd)
parts["frontDoor"] = fd
parts["frontDoorKnob"] = comp(sphere(30, (-900, 75, 1000)), sphere(30, (-900, -25, 1000)), cyl(10, 100, (-900, -25, 1000), (0, 1, 0)))

# ---- interior door frame (opening 1100 x 2150 in a 120 mm wall)
DF = [box(60, 170, 2150, (-580, 0, 1075)), box(60, 170, 2150, (580, 0, 1075)), box(1220, 170, 60, (0, 0, 2180))]
parts["doorFrame"] = comp(*DF)

# ---- window frames sized per opening
win_frames = {}
for wi, (x1, z1, x2, z2, ops) in enumerate(house["walls"]):
    for oi, (a, b, bottom, top, kind) in enumerate(ops):
        if kind != "window" or (abs(z1 - 2.96) < 1e-6 and abs(a - 6.95) < 1e-6):
            continue  # the office window already has its own frame
        W, Hh = (b - a) * 1000, (top - bottom) * 1000
        P2 = 56
        name = "winFrame%d_%d" % (wi, oi)
        parts[name] = comp(box(W, 140, P2, (0, -60, P2 / 2)), box(W, 140, P2, (0, -60, Hh - P2 / 2)), box(P2, 140, Hh, (-W / 2 + P2 / 2, -60, Hh / 2)),
                           box(P2, 140, Hh, (W / 2 - P2 / 2, -60, Hh / 2)), box(30, 50, Hh, (0, -60, Hh / 2)), rbox(W + 100, 160, 30, 6, (0, 70, -15)))
        win_frames[name] = (wi, oi)

# ---- garden
parts["treeTrunk"] = comp(Part.makeCone(150, 90, 2600), tube([(0, 0, 1700), (380, 120, 2300)], 50))
parts["treeCanopy"] = comp(ellipsoid(1300, 1200, 1100, (0, 0, 3300)), ellipsoid(900, 900, 800, (500, 300, 3900)), ellipsoid(950, 850, 800, (-450, -300, 3800)))
parts["bush"] = comp(ellipsoid(600, 500, 450, (0, 0, 300)), ellipsoid(450, 420, 380, (450, 150, 280)), ellipsoid(420, 400, 360, (-420, -100, 260)))
parts["steppingStones"] = comp(*[cyl(220, 40, (i * 700, (i % 2) * 120, 0)) for i in range(5)])


# ======================================================================= PLACEMENT
def item(name, pos, rot, pieces, scale=1, solid=True, tag=None):
    return {"name": name, "pos": [pos[0], pos[1], pos[2]], "rot": rot, "scale": scale, "parts": pieces, "solid": solid, "tag": tag}


PI = math.pi
furniture = [
    # kitchen
    item("kitchen", (-6.45, 0, 2.6), 0, [["kitchenBase", "cabinet"], ["kitchenTop", "stone"], ["kitchenSink", "steel"], ["kitchenFaucet", "chrome"], ["kitchenHob", "blackGlass"],
                                           ["kitchenBurners", "plasticDark"], ["kitchenOven", "blackGlass"], ["kitchenUppers", "cabinet"], ["kitchenHandles", "chrome"], ["rangeHood", "steel"]]),
    item("fridge", (-3.45, 0, 2.54), 0, [["fridgeBody", "steel"], ["fridgeShelves", "glass"], ["fridgeLight", "fridgeLight"], ["fridgeCans", "cans"], ["fridgeFreezer", "steel"]], tag="fridge"),
    item("diningTable", (-6.6, 0, 0.0), 0, [["diningTop", "wood"], ["diningLegs", "woodDark"], ["fruitBowl", "ceramic"], ["fruit", "fruit"]]),
    item("diningChair1", (-7.0, 0, 0.62), 0, [["chairWood", "woodDark"]]),
    item("diningChair2", (-6.2, 0, 0.62), 0, [["chairWood", "woodDark"]]),
    item("diningChair3", (-7.0, 0, -0.62), PI, [["chairWood", "woodDark"]]),
    item("diningChair4", (-6.2, 0, -0.62), PI, [["chairWood", "woodDark"]]),
    item("plantKitchen", (-8.5, 0, -1.9), 0.4, [["pot", "ceramic"], ["soil", "soil"], ["leaves", "leaf"], ["stems", "stem"]], scale=2.6, tag="plant"),
    # living room
    item("tvStand", (3.25, 0, 0.6), -PI / 2, [["tvStand", "cabinet"], ["tvStandLegs", "plasticDark"], ["tvPanel", "plasticDark"]], tag="tv"),
    item("sofa", (6.95, 0, 0.6), PI / 2, [["sofaFrame", "sofa"], ["sofaCushions", "sofaCushion"], ["sofaLegs", "woodDark"], ["sofaPillows", "pillow"]], tag="sofa"),
    item("coffeeTable", (5.15, 0, 0.6), PI / 2, [["coffeeTableTop", "wood"], ["coffeeTableLegs", "plasticDark"], ["tableBooks", "booksMix"]]),
    item("armchair", (7.55, 0, -1.45), PI * 0.78, [["armchairFrame", "sofa"], ["armchairCushions", "sofaCushion"], ["armchairLegs", "woodDark"]]),
    item("plantLiving", (8.0, 0, 2.35), 1.2, [["pot", "ceramic"], ["soil", "soil"], ["leaves", "leaf"], ["stems", "stem"]], scale=3.2, tag="plant"),
    # bedroom
    item("bed", (-7.8, 0, -6.25), -PI / 2, [["bedFrame", "woodDark"], ["bedHead", "fabricBlue"], ["mattress", "linen"], ["blanket", "blanket"], ["pillowsBed", "linen"], ["chargePad", "chargeGlow"]], tag="bed"),
    item("nightstand1", (-8.65, 0, -7.55), -PI / 2, [["nightstand", "wood"], ["nightLampBase", "brass"], ["nightLampShade", "shade"]]),
    item("nightstand2", (-8.65, 0, -4.95), -PI / 2, [["nightstand", "wood"], ["nightLampBase", "brass"], ["nightLampShade", "shade"]]),
    item("wardrobe", (-5.4, 0, -4.36), 0, [["wardrobe", "cabinet"], ["wardrobeHandles", "brass"]]),
    item("plantBedroom", (-1.5, 0, -8.05), 0, [["pot", "ceramic"], ["soil", "soil"], ["leaves", "leaf"], ["stems", "stem"]], scale=2.4, tag="plant"),
    # bathroom
    item("bathtub", (-0.1, 0, -8.06), 0, [["bathtub", "porcelain"], ["bathWater", "water"], ["tubFaucet", "chrome"]]),
    item("vanity", (2.66, 0, -5.9), PI / 2, [["vanity", "woodDark"], ["vanityTop", "porcelain"], ["vanityBowl", "porcelain"], ["vanityFaucet", "chrome"], ["mirrorFrame", "plasticDark"], ["mirrorGlass", "mirror"]], tag="mirror"),
    item("toilet", (2.62, 0, -7.75), PI / 2, [["toilet", "porcelain"], ["toiletSeat", "porcelain"]]),
    item("towels", (-0.93, 0, -5.4), -PI / 2, [["towelRack", "chrome"], ["towel", "towel"]], solid=False),
    # workshop
    item("workbench", (5.6, 0, -8.06), PI, [["benchTop", "butcher"], ["benchFrame", "steelDark"], ["pegboard", "pegboard"], ["tools", "toolsMix"], ["vise", "steelDark"], ["benchGadget", "plasticDark"], ["solderLamp", "steelDark"]], tag="bench"),
    item("printer", (7.95, 0, -6.6), PI / 2, [["printerTable", "steelDark"], ["printerFrame", "plasticDark"], ["printerBed", "steel"], ["printerSpool", "spool"], ["printerLed", "glowSoft"]], tag="printer"),
    item("partsShelf", (3.35, 0, -6.3), -PI / 2, [["metalShelf", "steelDark"], ["storageBoxes", "boxes"]], tag="partsShelf"),
    item("toolChest", (7.9, 0, -4.31), 0, [["toolChest", "red"], ["toolChestDrawers", "chrome"]]),
    # hallway
    item("console", (-4.6, 0, -2.64), 0, [["consoleTable", "wood"]]),
    item("coatRack", (8.05, 0, -3.85), 0.6, [["coatRack", "woodDark"], ["coat", "fabricBlue"]]),
    item("plantHall", (-8.45, 0, -3.25), 2.0, [["pot", "ceramic"], ["soil", "soil"], ["leaves", "leaf"], ["stems", "stem"]], scale=2.2, tag="plant"),
    item("frontDoor", (8.5, 0, -2.7), PI / 2, [["frontDoor", "doorWood"], ["frontDoorKnob", "brass"]], solid=False, tag="frontDoor"),
]

# door frames on every interior door
for wi, (x1, z1, x2, z2, ops) in enumerate(house["walls"]):
    horiz = abs(z1 - z2) < 1e-6
    for (a, b, bottom, top, kind) in ops:
        if kind != "door" or (wi == 3):
            continue
        mid = (a + b) / 2
        px, pz = (x1 + mid, z1) if horiz else (x1, z1 + mid)
        furniture.append(item("doorFrame%d_%d" % (wi, int(a * 10)), (px, 0, pz), 0 if horiz else PI / 2, [["doorFrame", "frameWhite"]], solid=False))
    for oi, (a, b, bottom, top, kind) in enumerate(ops):
        name = "winFrame%d_%d" % (wi, oi)
        if name not in win_frames:
            continue
        mid = (a + b) / 2
        px, pz = (x1 + mid, z1) if horiz else (x1, z1 + mid)
        # frame's +Y (sill side) must point into the house
        inward = {0: 0, 1: PI, 2: -PI / 2, 3: PI / 2}.get(wi, 0)
        furniture.append(item(name, (px, bottom, pz), inward, [[name, "frameWhite"]], solid=False))

# garden
for i, (tx, tz, s) in enumerate(((-12.5, 5.5, 1.0), (11.5, 4.8, 1.15), (-12.0, -11.0, 0.9), (12.5, -10.5, 1.05), (-1.5, 7.5, 1.2), (5.5, -12.5, 0.95), (-6.5, -12.0, 1.1), (6.0, 7.0, 0.85))):
    furniture.append(item("tree%d" % i, (tx, 0, tz), i * 1.3, [["treeTrunk", "bark"], ["treeCanopy", "canopy"]], scale=s, solid=False))
for i, (bx, bz) in enumerate(((10.0, -1.5), (10.2, -5.5), (9.6, 1.8), (-10.0, -3.0), (-10.2, 1.5), (2.0, 4.0), (-4.0, 4.1), (4.0, -9.8), (-3.0, -9.7))):
    furniture.append(item("bush%d" % i, (bx, 0, bz), i * 0.8, [["bush", "canopy"]], scale=0.8 + (i % 3) * 0.15, solid=False))
furniture.append(item("stones", (9.2, 0, -3.2), -PI / 2, [["steppingStones", "stone"]], solid=False))
house["furniture"] = furniture


# obstacles for the robot's path planner: footprint of each solid item, in three.js x/z
def footprint(it):
    bb = None
    for pname, _ in it["parts"]:
        s = parts[pname].copy()
        if it["scale"] != 1:
            s.scale(it["scale"])
        s.rotate(V(0, 0, 0), V(0, 0, 1), math.degrees(it["rot"]))
        b = s.BoundBox
        bb = b if bb is None else bb.united(b)
    x, z = it["pos"][0], it["pos"][2]
    return [round(x + bb.XMin / 1000.0, 3), round(z - bb.YMax / 1000.0, 3), round(x + bb.XMax / 1000.0, 3), round(z - bb.YMin / 1000.0, 3)]


house["obstacles"] = [footprint(it) for it in furniture if it["solid"] and it["pos"][1] == 0 and not it["name"].startswith(("tree", "bush"))]

def spot(x, z, heading, **extra):
    d = {"pos": [x, 0, z], "heading": heading}
    d.update(extra)
    return d


house["spots"] = {
    "tv": spot(6.68, 0.6, PI / 2, seat=0.495, look=[3.3, 1.08, 0.6]),
    "fridge": spot(-3.45, 1.5, PI),
    "bench": spot(5.6, -7.2, 0),
    "mirror": spot(2.0, -5.9, -PI / 2),
    "bed": spot(-7.55, -5.62, PI, seat=0.565),
    "livingWindow": spot(5.8, 2.25, PI),
    "frontDoor": spot(7.75, -3.2, -PI / 2),
    "printer": spot(7.15, -6.6, -PI / 2),
    "partsShelf": spot(4.15, -6.3, PI / 2),
    "dining": spot(-6.6, -1.1, 0),
}
house["lights"] = [
    {"room": "living", "pos": [5.6, 2.3, 0.4]}, {"room": "kitchen", "pos": [-6.2, 2.3, 0.5]},
    {"room": "bedroom", "pos": [-5.5, 2.3, -6.2]}, {"room": "workshop", "pos": [5.8, 2.3, -6.3]},
]
layout["house"] = house


# ======================================================================= FREECAD PREVIEW OF THE HOUSE
HOUSE_COLORS = {
    "cabinet": (0.93, 0.92, 0.9), "stone": (0.82, 0.82, 0.8), "steel": (0.75, 0.77, 0.8), "chrome": (0.85, 0.87, 0.9), "blackGlass": (0.1, 0.1, 0.12),
    "wood": (0.86, 0.71, 0.52), "woodDark": (0.55, 0.38, 0.24), "sofa": (0.36, 0.45, 0.58), "sofaCushion": (0.42, 0.52, 0.66), "pillow": (0.93, 0.55, 0.35),
    "linen": (0.96, 0.95, 0.93), "blanket": (0.45, 0.62, 0.55), "fabricBlue": (0.3, 0.38, 0.55), "porcelain": (0.97, 0.97, 0.97), "red": (0.8, 0.2, 0.18),
    "canopy": (0.3, 0.55, 0.3), "bark": (0.4, 0.28, 0.18), "frameWhite": (0.96, 0.96, 0.95), "doorWood": (0.55, 0.36, 0.22), "plasticDark": (0.2, 0.21, 0.24),
}


def wall_solid(x1, z1, x2, z2, ops):
    horiz = abs(z1 - z2) < 1e-6
    L = (abs(x2 - x1) if horiz else abs(z2 - z1)) * 1000 + WALL_T * 1000
    w = Part.makeBox(L, WALL_T * 1000, H_WALL * 1000, V(-WALL_T * 500, -WALL_T * 500, 0))
    for (a, b, bottom, top, kind) in ops:
        w = w.cut(Part.makeBox((b - a) * 1000, WALL_T * 1000 + 20, (top - bottom) * 1000, V(a * 1000, -WALL_T * 500 - 10, bottom * 1000)))
    # place: along +X from (x1, z1) for horizontal walls, along three +z (= FreeCAD -Y) for vertical ones
    pl = App.Placement(V(x1 * 1000, -z1 * 1000, 0), App.Rotation(V(0, 0, 1), 0 if horiz else -90))
    w.Placement = pl
    return w


def preview_house(doc):
    walls = [wall_solid(*w) for w in house["walls"]]
    o = doc.addObject("Part::Feature", "HouseWalls")
    o.Shape = Part.makeCompound(walls)
    o.ViewObject.ShapeColor = (0.92, 0.9, 0.86)
    o.ViewObject.Transparency = 35
    for r in house["rooms"]:
        x0, z0, x1, z1 = r["rect"]
        f = doc.addObject("Part::Feature", "Floor_" + r["id"])
        f.Shape = Part.makeBox((x1 - x0) * 1000, (z1 - z0) * 1000, 10, V(x0 * 1000, -z1 * 1000, -10))
        f.ViewObject.ShapeColor = {"oak": (0.85, 0.72, 0.55), "walnut": (0.6, 0.45, 0.32), "tile": (0.9, 0.9, 0.88), "bathtile": (0.85, 0.92, 0.95), "carpet": (0.7, 0.72, 0.78), "concrete": (0.7, 0.7, 0.68)}[r["floor"]]
    for it in house["furniture"]:
        for pname, mat in it["parts"]:
            o = doc.addObject("Part::Feature", "%s_%s" % (it["name"], pname))
            s = parts[pname].copy()
            if it["scale"] != 1:
                s.scale(it["scale"])
            o.Shape = s
            o.Placement = App.Placement(V(it["pos"][0] * 1000, -it["pos"][2] * 1000, it["pos"][1] * 1000), App.Rotation(V(0, 0, 1), math.degrees(it["rot"]))).multiply(s.Placement)
            try:
                o.ViewObject.ShapeColor = HOUSE_COLORS.get(mat, (0.7, 0.7, 0.72))
            except Exception:
                pass
