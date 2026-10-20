import * as THREE from 'three';
import { planarUV, rugTexture, woodTexture, floorTextures } from './assets.js';

const UI = '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

function mesh(geo, mat, parent, { cast = true, receive = true, name = '' } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.name = name;
  parent.add(m);
  return m;
}

function place(obj, cfg) {
  obj.position.fromArray(cfg.pos);
  obj.rotation.y = cfg.rot || 0;
  if (cfg.scale) obj.scale.setScalar(cfg.scale);
  return obj;
}

function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function roundRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function roundPlane(w, h, r) {
  const g = new THREE.ShapeGeometry(roundRectShape(w, h, r), 8);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

function rr(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/** Build the room and all the props. Returns handles the brain and main loop need. */
export function buildRoom(scene, geos, layout, M, screen) {
  const P = layout.place;
  const out = {};
  const room = new THREE.Group();
  room.name = 'room';
  scene.add(room);
  out.room = room;

  // ------------------------------------------------------------ shell: floor slab, walls, rug
  const R = layout.room;
  const front = -1.75;
  const floorW = R.right - R.left, floorD = R.back - front;
  const ft = floorTextures();
  for (const t of [ft.map, ft.normalMap, ft.roughnessMap]) t.repeat.set(floorW / ft.tileMeters, floorD / ft.tileMeters);
  const floorMat = new THREE.MeshPhysicalMaterial({
    map: ft.map, normalMap: ft.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: ft.roughnessMap, roughness: 1,
    clearcoat: 0.35, clearcoatRoughness: 0.28, envMapIntensity: 0.9,
  });
  const floor = mesh(new THREE.PlaneGeometry(floorW, floorD), floorMat, room, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (R.back + front) / 2);
  floor.name = 'floor';
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xd9d5ce, roughness: 0.8 });
  const slab = mesh(new THREE.BoxGeometry(floorW + 0.24, 0.24, floorD + 0.12), slabMat, room, { cast: false });
  slab.position.set(0, -0.136, (R.back + front) / 2 + 0.06); // top sits 1.6 cm under the floor: no z-fighting
  const trim = mesh(new THREE.BoxGeometry(floorW + 0.25, 0.012, floorD + 0.13), new THREE.MeshStandardMaterial({ color: 0xa98760, roughness: 0.6 }), room, { cast: false });
  trim.position.set(0, -0.012, (R.back + front) / 2 + 0.06);

  const rug = mesh(new THREE.CircleGeometry(1.35, 96), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }), room, { cast: false });
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, 0.15);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9e5de, roughness: 0.92 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xb9c7bd, roughness: 0.9 });
  const T = 0.12;
  // back wall with a hole for the window
  const win = P.window;
  const [ww, wh] = layout.window.size;
  const wx = win.pos[0], wy = win.pos[1];
  const shape = new THREE.Shape();
  shape.moveTo(R.left - T, 0); shape.lineTo(R.right + T, 0); shape.lineTo(R.right + T, R.height); shape.lineTo(R.left - T, R.height); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(wx - ww / 2 + 0.01, wy + 0.01); hole.lineTo(wx + ww / 2 - 0.01, wy + 0.01); hole.lineTo(wx + ww / 2 - 0.01, wy + wh - 0.01); hole.lineTo(wx - ww / 2 + 0.01, wy + wh - 0.01); hole.closePath();
  shape.holes.push(hole);
  const backWall = mesh(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false }), accentMat, room);
  backWall.position.set(0, 0, R.back);
  backWall.userData.wallNormal = new THREE.Vector3(0, 0, -1);
  const sideGeo = new THREE.BoxGeometry(T, R.height, R.back - front + T);
  const rightWall = mesh(sideGeo, wallMat, room);
  rightWall.position.set(R.right + T / 2, R.height / 2, (R.back + front) / 2 + T / 2);
  rightWall.userData.wallNormal = new THREE.Vector3(-1, 0, 0);
  const leftWall = mesh(sideGeo, wallMat, room);
  leftWall.position.set(R.left - T / 2, R.height / 2, (R.back + front) / 2 + T / 2);
  leftWall.userData.wallNormal = new THREE.Vector3(1, 0, 0);
  out.walls = [backWall, rightWall, leftWall];
  const skirt = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.6 });
  const sk1 = mesh(new THREE.BoxGeometry(floorW, 0.09, 0.016), skirt, backWall, { cast: false });
  sk1.position.set(0, 0.045, -0.008);
  [rightWall, leftWall].forEach((wall, i) => {
    const sk = mesh(new THREE.BoxGeometry(0.016, 0.09, R.back - front), skirt, wall, { cast: false });
    sk.position.set(i === 0 ? -T / 2 - 0.008 : T / 2 + 0.008, 0.045 - R.height / 2, -T / 2);
  });

  // ------------------------------------------------------------ desk
  const desk = place(new THREE.Group(), P.desk);
  room.add(desk);
  planarUV(geos.deskTop, 'y', 0.66, 1.33, 0.5, 0.5);
  mesh(geos.deskTop, M.wood, desk, { name: 'deskTop' });
  mesh(geos.deskFrame, M.powder, desk);
  mesh(geos.cableTray, M.plasticDark, desk);
  out.desk = desk;
  out.deskTopY = 0.74;

  // ------------------------------------------------------------ chair (rolls)
  const chair = place(new THREE.Group(), P.chair);
  room.add(chair);
  mesh(geos.chairBase, M.plasticDark, chair);
  out.chairWheels = mesh(geos.chairWheels, M.plasticDark, chair);
  mesh(geos.chairLift, M.chrome, chair);
  const seatSwivel = new THREE.Group();
  chair.add(seatSwivel);
  mesh(geos.chairSeat, M.fabric, seatSwivel);
  mesh(geos.chairBack, M.fabric, seatSwivel);
  mesh(geos.chairFrame, M.plasticDark, seatSwivel);
  mesh(geos.chairArms, M.plasticDark, seatSwivel);
  out.chair = chair;
  out.chairSeat = seatSwivel;
  out.chairHome = chair.position.clone();

  // ------------------------------------------------------------ MacBook
  const laptop = place(new THREE.Group(), P.laptop);
  room.add(laptop);
  laptop.name = 'laptop';
  const LL = layout.laptop;
  mesh(geos.laptopBase, M.alu, laptop, { name: 'laptopBase' });
  mesh(geos.laptopHinge, M.plasticDark, laptop);
  mesh(geos.keys, M.keys, laptop);
  const legends = buildKeyLegends(LL);
  const legendPlane = mesh(new THREE.PlaneGeometry(0.31, 0.13), new THREE.MeshBasicMaterial({ map: legends, transparent: true, toneMapped: false, color: 0xbfc8d6, depthWrite: false }), laptop, { cast: false, receive: false });
  legendPlane.rotation.x = -Math.PI / 2;
  legendPlane.position.set(0, LL.keyTop + 0.0003, -0.040);
  const [, tpY, tpZ, tpW, tpH] = LL.trackpad;
  const trackpad = mesh(roundPlane(tpW, tpH, 0.008), new THREE.MeshPhysicalMaterial({ color: 0x7d828a, metalness: 0.9, roughness: 0.22, clearcoat: 1 }), laptop, { cast: false });
  trackpad.rotation.x = -Math.PI / 2;
  trackpad.position.set(0, tpY + 0.0002, tpZ);
  const lid = new THREE.Group();
  lid.position.fromArray(LL.lidPivot);
  lid.rotation.x = -0.27;
  laptop.add(lid);
  mesh(geos.laptopLid, M.alu, lid, { name: 'laptopLid' });
  const bezel = mesh(roundPlane(0.349, 0.243, 0.012), new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.15, clearcoat: 1 }), lid, { cast: false });
  bezel.position.set(0, 0.125, 0.0004);
  const screenMat = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });
  const screenMesh = mesh(new THREE.PlaneGeometry(0.338, 0.2163), screenMat, lid, { cast: false, receive: false, name: 'screen' });
  screenMesh.position.set(0, 0.1305, 0.0008);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.12, depthWrite: false });
  const glassMesh = mesh(new THREE.PlaneGeometry(0.338, 0.2163), glassMat, lid, { cast: false, receive: false });
  glassMesh.position.set(0, 0.1305, 0.0011);
  // lid back: glowing robot logo + stickers
  const logo = mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, toneMapped: false, color: new THREE.Color(1.6, 1.7, 1.8) }), lid, { cast: false, receive: false });
  logo.rotation.y = Math.PI;
  logo.position.set(0, 0.13, -0.0063);
  const stickers = mesh(new THREE.PlaneGeometry(0.34, 0.235), new THREE.MeshStandardMaterial({ map: stickerTexture(), transparent: true, roughness: 0.35, alphaTest: 0.02 }), lid, { cast: false });
  stickers.rotation.y = Math.PI;
  stickers.position.set(0, 0.127, -0.0062);
  const screenLight = new THREE.PointLight(0x9fd8ff, 0.2, 0.9, 2);
  screenLight.position.set(0, 0.14, 0.12);
  lid.add(screenLight);
  out.laptop = laptop;
  out.lid = lid;
  out.screenMesh = screenMesh;
  out.screenMat = screenMat;
  out.screenLight = screenLight;
  out.keyWorld = (i) => {
    const k = LL.keys[i];
    return laptop.localToWorld(new THREE.Vector3(k[0], LL.keyTop, -k[1]));
  };
  out.keyCount = LL.keys.length;
  out.laptopClickables = [screenMesh, bezel, glassMesh, laptop.children[0], laptop.children[2], trackpad, legendPlane, stickers, logo];

  // ------------------------------------------------------------ mug (+ steam)
  const mug = place(new THREE.Group(), P.mug);
  room.add(mug);
  mesh(geos.mug, M.mug, mug, { name: 'mug' });
  const coffee = mesh(geos.coffee, M.coffee, mug, { cast: false });
  out.mug = mug;
  out.mugHome = { pos: mug.position.clone(), quat: mug.quaternion.clone() };
  out.coffee = coffee;
  out.setFill = (f) => {
    coffee.visible = f > 0.02;
    coffee.position.y = -0.078 + 0.012 + f * 0.07;
  };
  out.setFill(0.8);
  out.steam = makeSteam(mug);

  // ------------------------------------------------------------ desk plant, notebook
  const plant = place(new THREE.Group(), P.plantSmall);
  room.add(plant);
  buildPlant(plant, geos, M);
  out.plantSmall = plant;
  const nb = place(new THREE.Group(), P.notebook);
  room.add(nb);
  mesh(geos.notebook, M.paper, nb);
  mesh(geos.notebookBand, M.band, nb, { cast: false });
  const pen = mesh(geos.pen, M.pen, nb);
  pen.position.set(0.02, 0.014, -0.02);
  pen.rotation.y = 0.5;

  // ------------------------------------------------------------ bookshelf
  const shelf = place(new THREE.Group(), P.bookshelf);
  room.add(shelf);
  planarUV(geos.shelf, 'z', 1.2, 1.2);
  mesh(geos.shelf, M.woodDark, shelf);
  for (let i = 0; i < 5; i++) mesh(geos['books' + i], M.books[i], shelf);
  const globe = new THREE.Group();
  shelf.add(globe);
  const gc = geos.globe.boundingSphere.center.clone();
  geos.globe.translate(-gc.x, -gc.y, -gc.z);
  globe.position.copy(gc);
  const globeMesh = mesh(geos.globe, M.globe, globe);
  mesh(geos.globeStand, M.brass, shelf);
  out.globe = globe;
  out.shelf = shelf;

  // ------------------------------------------------------------ sideboard + coffee machine
  const sb = place(new THREE.Group(), P.sideboard);
  room.add(sb);
  mesh(geos.sideboard, M.cabinet, sb);
  planarUV(geos.sideboardTop, 'y', 0.8, 1.6, 0.5, 0.5);
  mesh(geos.sideboardTop, M.wood, sb);
  mesh(geos.sideboardLegs, M.plasticDark, sb);
  mesh(geos.sideboardKnobs, M.brass, sb);
  const cm = place(new THREE.Group(), P.coffeeMachine);
  room.add(cm);
  mesh(geos.coffeeMachine, M.machine, cm);
  mesh(geos.coffeeTop, M.steel, cm);
  mesh(geos.coffeeNozzle, M.steel, cm);
  mesh(geos.coffeeTray, M.steel, cm);
  mesh(geos.coffeeTank, M.glass, cm, { cast: false });
  const buttonMat = M.button.clone();
  mesh(geos.coffeeButton, buttonMat, cm);
  const stream = mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 1, 10), new THREE.MeshPhysicalMaterial({ color: 0x3a1f10, roughness: 0.1, clearcoat: 1 }), cm, { cast: false });
  stream.visible = false;
  out.coffeeMachine = cm;
  out.coffeeButtonMat = buttonMat;
  out.coffeeStream = stream;
  out.cupSpot = () => cm.localToWorld(new THREE.Vector3(...layout.coffeeMachine.cupSpot));
  out.coffeeButton = () => cm.localToWorld(new THREE.Vector3(0.052, 0.28, -0.124));
  out.nozzle = () => cm.localToWorld(new THREE.Vector3(...layout.coffeeMachine.nozzle));

  // ------------------------------------------------------------ arc lamp
  const lamp = place(new THREE.Group(), P.lamp);
  room.add(lamp);
  mesh(geos.lampBase, M.marble, lamp);
  mesh(geos.lampPole, M.chrome, lamp);
  const shadeMat = M.shade.clone();
  mesh(geos.lampShade, shadeMat, lamp);
  const bulbMat = M.bulb.clone();
  mesh(geos.lampBulb, bulbMat, lamp, { cast: false });
  const lampLight = new THREE.PointLight(0xffc98a, 0, 6, 1.6);
  lampLight.position.fromArray(layout.lamp.bulb).add(new THREE.Vector3(0, -0.05, 0));
  lamp.add(lampLight);
  out.lamp = { light: lampLight, shade: shadeMat, bulb: bulbMat };

  // ------------------------------------------------------------ floor plant
  const fp = place(new THREE.Group(), P.plantFloor);
  room.add(fp);
  buildPlant(fp, geos, M);
  out.plantFloor = fp;

  // ------------------------------------------------------------ window, sky, city
  const wnd = place(new THREE.Group(), P.window);
  room.add(wnd);
  mesh(geos.windowFrame, M.frameWhite, wnd);
  mesh(geos.windowSill, M.frameWhite, wnd);
  const glass = mesh(new THREE.PlaneGeometry(ww - 0.1, wh - 0.1), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.08, clearcoat: 1, depthWrite: false }), wnd, { cast: false });
  glass.position.set(0, wh / 2, layout.window.glassZ ?? 0.06); // in the middle of the wall, with the mullions
  const sky = buildSky();
  sky.mesh.position.set(wx, 1.6, R.back + 3.2);
  room.add(sky.mesh);
  const city = buildCity();
  city.mesh.position.set(wx, 0.4, R.back + 2.6);
  room.add(city.mesh);
  out.sky = sky;
  out.city = city;

  // ------------------------------------------------------------ wall art
  const blueprint = mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshStandardMaterial({ map: blueprintTexture(), roughness: 0.6 }), room, { cast: false });
  blueprint.position.set(0.45, 1.55, R.back - 0.012);
  blueprint.rotation.y = Math.PI;
  frameAround(room, blueprint, 0.9, 1.2, M.plasticDark);
  const hello = mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshStandardMaterial({ map: helloTexture(), roughness: 0.7 }), room, { cast: false });
  hello.position.set(R.left + 0.012, 1.5, 0.3);
  hello.rotation.y = Math.PI / 2;
  frameAround(room, hello, 0.8, 1.0, M.frameWhite);
  const neon = mesh(new THREE.PlaneGeometry(1.3, 0.42), new THREE.MeshBasicMaterial({ map: neonTexture(), transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) }), room, { cast: false, receive: false });
  neon.position.set(R.right - 0.02, 1.72, 1.0);
  neon.rotation.y = -Math.PI / 2;
  const neonLight = new THREE.PointLight(0xff4fa0, 0.6, 2.5, 2);
  neonLight.position.set(R.right - 0.25, 1.7, 1.0);
  room.add(neonLight);
  out.neon = { mesh: neon, light: neonLight };

  return out;
}

// ---------------------------------------------------------------- pieces
function buildPlant(group, geos, M) {
  mesh(geos.pot, M.ceramic, group);
  mesh(geos.soil, M.soil, group, { cast: false });
  const sway = new THREE.Group();
  group.add(sway);
  mesh(geos.leaves, M.leaf, sway);
  mesh(geos.stems, M.stem, sway);
  group.userData.sway = sway;
}

function makeSteam(parent) {
  const tex = canvasTex(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  });
  const group = new THREE.Group();
  parent.add(group);
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.t = Math.random();
    s.userData.seed = Math.random() * 10;
    group.add(s);
    puffs.push(s);
  }
  return {
    group, on: true,
    update(dt, heat) {
      for (const s of puffs) {
        s.userData.t += dt * 0.35;
        if (s.userData.t > 1) { s.userData.t = 0; s.userData.seed = Math.random() * 10; }
        const t = s.userData.t;
        s.position.set(Math.sin(t * 5 + s.userData.seed) * 0.012 * (1 + t * 2), 0.09 + t * 0.2, Math.cos(t * 4 + s.userData.seed) * 0.01);
        s.scale.setScalar(0.02 + t * 0.06);
        s.material.opacity = Math.sin(t * Math.PI) * 0.35 * heat * (this.on ? 1 : 0);
      }
    },
  };
}

function frameAround(parent, plane, w, h, mat) {
  const g = new THREE.Group();
  plane.parent.add(g);
  g.position.copy(plane.position);
  g.rotation.copy(plane.rotation);
  const t = 0.03, d = 0.03;
  [[0, h / 2 + t / 2, w + 2 * t, t], [0, -h / 2 - t / 2, w + 2 * t, t], [w / 2 + t / 2, 0, t, h], [-w / 2 - t / 2, 0, t, h]].forEach(([x, y, bw, bh]) => {
    const m = mesh(new THREE.BoxGeometry(bw, bh, d), mat, g);
    m.position.set(x, y, -d / 2 + 0.006);
  });
}

function buildKeyLegends(LL) {
  // Legend plane covers x ∈ [-0.155, 0.155], z ∈ [-0.105, 0.025] in laptop space (centre z = -0.040)
  const PW = 0.31, PH = 0.13, S = 4096 / PW;
  const labels = [
    'esc F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 ⏻',
    '` 1 2 3 4 5 6 7 8 9 0 - = ⌫',
    '⇥ Q W E R T Y U I O P [ ] \\',
    '⇪ A S D F G H J K L ; \' ↩',
    '⇧ Z X C V B N M , . / ⇧',
    'fn ⌃ ⌥ ⌘  ⌘ ⌥ ◀ ▲ ▼ ▶',
  ].map((r) => r.split(' '));
  const flat = labels.flat();
  return canvasTex(4096, Math.round(PH * S), (x) => {
    x.clearRect(0, 0, 4096, PH * S);
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    LL.keys.forEach((k, i) => {
      const cx = (k[0] + PW / 2) * S;
      const cy = (-k[1] + 0.040 + PH / 2) * S;
      const label = flat[i] ?? '';
      x.font = `${label.length > 2 ? 64 : 92}px ${UI}`;
      x.fillText(label, cx, cy);
    });
  });
}

function logoTexture() {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = '#fff';
    x.shadowColor = '#bfefff';
    x.shadowBlur = 18;
    x.beginPath(); x.ellipse(128, 120, 84, 76, 0, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'destination-out';
    rr(x, 66, 96, 124, 50, 25); x.fill();
    x.globalCompositeOperation = 'source-over';
    x.beginPath(); x.arc(102, 121, 10, 0, Math.PI * 2); x.arc(154, 121, 10, 0, Math.PI * 2); x.fill();
    x.fillRect(116, 196, 24, 26);
    rr(x, 30, 98, 22, 46, 10); x.fill();
    rr(x, 204, 98, 22, 46, 10); x.fill();
  });
}

function stickerTexture() {
  return canvasTex(1360, 940, (x) => {
    x.clearRect(0, 0, 1360, 940);
    const sticker = (cx, cy, rot, draw) => { x.save(); x.translate(cx, cy); x.rotate(rot); x.shadowColor = 'rgba(0,0,0,0.25)'; x.shadowBlur = 6; draw(); x.restore(); };
    sticker(260, 220, -0.18, () => { // FreeCAD-style gear
      x.fillStyle = '#d23c3c'; x.beginPath(); x.arc(0, 0, 92, 0, Math.PI * 2); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#fff'; x.font = `800 44px ${UI}`; x.textAlign = 'center'; x.fillText('CAD', 0, 15);
      x.font = `600 20px ${UI}`; x.fillText('made in', 0, -28);
    });
    sticker(1080, 230, 0.12, () => {
      x.fillStyle = '#111'; rr(x, -170, -50, 340, 100, 20); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#5dff8a'; x.font = `600 46px Menlo, monospace`; x.textAlign = 'center'; x.fillText('$ ship it', 0, 16);
    });
    sticker(250, 720, 0.2, () => {
      x.fillStyle = '#ffcb47'; x.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; x.lineTo(Math.cos(a) * 96, Math.sin(a) * 96); }
      x.closePath(); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#1b1b1b'; x.font = `800 40px ${UI}`; x.textAlign = 'center'; x.fillText('∞ RAM', 0, 14);
    });
    sticker(1100, 720, -0.1, () => {
      x.fillStyle = '#3d6cf2'; rr(x, -150, -70, 300, 140, 70); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#fff'; x.font = `700 36px ${UI}`; x.textAlign = 'center'; x.fillText('localhost', 0, -4); x.font = `500 30px ${UI}`; x.fillText(':3000', 0, 36);
    });
    sticker(700, 840, 0.04, () => {
      x.fillStyle = '#f6f1e7'; rr(x, -210, -36, 420, 72, 10); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#c2453d'; x.font = `700 32px ${UI}`; x.textAlign = 'center'; x.fillText('sudo make me a coffee', 0, 11);
    });
  });
}

function blueprintTexture() {
  return canvasTex(900, 1200, (x, w, h) => {
    x.fillStyle = '#1d4f8f';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < w; i += 30) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
    for (let i = 0; i < h; i += 30) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.strokeStyle = '#e8f1ff';
    x.lineWidth = 3;
    const cx = 450;
    x.beginPath(); x.ellipse(cx, 300, 150, 140, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.ellipse(cx, 300, 112, 56, 0, 0, Math.PI * 2); x.stroke();
    [-1, 1].forEach((s) => { x.strokeRect(cx + s * 165 - 20, 245, 40, 110); });
    x.strokeRect(cx - 32, 440, 64, 70);
    x.beginPath(); x.ellipse(cx, 700, 210, 200, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(cx, 640, 36, 0, Math.PI * 2); x.stroke();
    [-1, 1].forEach((s) => {
      x.beginPath(); x.ellipse(cx + s * 270, 560, 84, 66, 0, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.moveTo(cx + s * 262, 610); x.lineTo(cx + s * 300, 860); x.stroke();
    });
    x.setLineDash([10, 8]);
    x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(cx, 120); x.lineTo(cx, 960); x.stroke();
    x.setLineDash([]);
    x.fillStyle = '#e8f1ff';
    x.font = `20px Menlo, monospace`;
    x.beginPath(); x.moveTo(300, 470); x.lineTo(600, 470); x.stroke();
    x.fillText('Ø 304', 420, 462);
    x.fillText('R 140', 610, 300);
    x.strokeRect(470, 1000, 400, 170);
    x.font = `700 34px ${UI}`;
    x.fillText('MR·AGENT  Mk II', 490, 1050);
    x.font = `18px Menlo, monospace`;
    x.fillText('SHEET 1/1   SCALE 1:5', 490, 1090);
    x.fillText('DRAWN: FreeCAD 1.1', 490, 1120);
    x.fillText('MATERIAL: ceramic polymer', 490, 1150);
  });
}

function helloTexture() {
  return canvasTex(800, 1000, (x, w, h) => {
    x.fillStyle = '#f2ece2';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8714f';
    x.beginPath(); x.arc(560, 330, 190, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1d2433';
    x.font = `800 150px Georgia, serif`;
    x.fillText('Hello,', 60, 560);
    x.fillText('World.', 60, 720);
    x.font = `500 26px Menlo, monospace`;
    x.fillText('printf("hello, world\\n");', 60, 820);
    x.font = `22px ${UI}`;
    x.fillStyle = '#6b6457';
    x.fillText('Kernighan & Ritchie, 1978', 60, 900);
  });
}

function neonTexture() {
  return canvasTex(1300, 420, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    const glowText = (t, px, py, col, size) => {
      x.font = `600 ${size}px "Snell Roundhand", "Brush Script MT", cursive`;
      for (const [blur, alpha] of [[40, 0.7], [16, 0.9], [0, 1]]) {
        x.shadowColor = col; x.shadowBlur = blur; x.fillStyle = blur ? col : '#fff';
        x.globalAlpha = alpha;
        x.fillText(t, px, py);
      }
      x.globalAlpha = 1;
    };
    x.textAlign = 'center';
    glowText('</>', 220, 270, '#49e3ff', 200);
    glowText('keep shipping', 800, 260, '#ff4fa0', 150);
  });
}

function buildSky() {
  const uniforms = {
    top: { value: new THREE.Color(0x6fb6ff) }, bottom: { value: new THREE.Color(0xd8ecff) },
    sunPos: { value: new THREE.Vector2(0.3, 0.6) }, sunColor: { value: new THREE.Color(0xfff2d0) },
    stars: { value: 0 }, time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec2 sunPos; uniform vec3 sunColor; uniform float stars; uniform float time;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 col = mix(bottom, top, smoothstep(0.0, 1.0, vUv.y));
        float d = distance(vUv * vec2(1.6, 1.0), sunPos * vec2(1.6, 1.0));
        col += sunColor * (smoothstep(0.06, 0.0, d) * 2.0 + smoothstep(0.5, 0.0, d) * 0.25);
        float c = noise(vUv * vec2(6.0, 14.0) + vec2(time * 0.01, 0.0)) * noise(vUv * vec2(13.0, 30.0) - vec2(time * 0.015, 0.0));
        col = mix(col, mix(vec3(1.0), sunColor, 0.3) * (0.5 + 0.5 * (1.0 - stars)), smoothstep(0.18, 0.45, c) * 0.55 * smoothstep(0.25, 0.6, vUv.y));
        float s = step(0.9975, hash(floor(vUv * 600.0))) * stars * (0.6 + 0.4 * sin(time * 3.0 + hash(floor(vUv * 600.0)) * 40.0));
        col += vec3(s);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
  });
  const meshSky = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), mat);
  meshSky.rotation.y = Math.PI;
  return { mesh: meshSky, uniforms };
}

function buildCity() {
  const W = 2048, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const buildings = [];
  let px = 0;
  let seed = 4;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (px < W) {
    const bw = 60 + rnd() * 140, bh = 120 + rnd() * 330;
    buildings.push([px, bw, bh, rnd()]);
    px += bw + 4;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), mat);
  m.rotation.y = Math.PI;
  const paint = (night, silhouette) => {
    x.clearRect(0, 0, W, H);
    for (const [bx, bw, bh, r] of buildings) {
      x.fillStyle = silhouette;
      x.fillRect(bx, H - bh, bw, bh);
      if (r > 0.6) x.fillRect(bx + bw * 0.4, H - bh - 30, 6, 30);
      for (let wy = H - bh + 16; wy < H - 10; wy += 22) {
        for (let wx2 = bx + 10; wx2 < bx + bw - 14; wx2 += 18) {
          const on = ((wx2 * 7 + wy * 13) % 11) / 11 < night * 0.75;
          x.fillStyle = on ? `rgba(255,${200 + ((wx2 * 3) % 40)},${120 + ((wy * 5) % 60)},${0.85})` : `rgba(255,255,255,${0.06 * (1 - night)})`;
          x.fillRect(wx2, wy, 9, 12);
        }
      }
    }
    tex.needsUpdate = true;
  };
  return { mesh: m, paint };
}
