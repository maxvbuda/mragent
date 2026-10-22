import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const lerp = THREE.MathUtils.lerp;

export class World {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(container.clientWidth, container.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap; // what three.js has been using in place of PCFSoft since it was removed
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.bg = new THREE.Color(0xe4e9f0);
    this.scene.background = this.bg;
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;

    this.camera = new THREE.PerspectiveCamera(36, container.clientWidth / container.clientHeight, 0.02, 300);
    // the office, desk in the foreground; `house` is the whole-house overview
    this.home = { pos: new THREE.Vector3(2.1, 2.6, -4.6), target: new THREE.Vector3(0.05, 0.8, 0.5) };
    this.overview = { pos: new THREE.Vector3(5.5, 15.5, -17.5), target: new THREE.Vector3(-0.2, 0, -2.6) };
    this.camera.position.copy(this.home.pos);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.target.copy(this.home.target);
    c.enableDamping = true;
    c.dampingFactor = 0.07;
    c.minDistance = 0.6;
    c.maxDistance = 34;
    c.maxPolarAngle = Math.PI * 0.495;
    c.update();

    // ---- lights
    this.hemi = new THREE.HemisphereLight(0xf3f6ff, 0xc9b79a, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sunCenter = new THREE.Vector3(-0.25, 0, -2.8); // middle of the house
    this.sun.position.set(-3.6, 9, 12);
    this.sun.target.position.copy(this.sunCenter);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    this.key = new THREE.DirectionalLight(0xffffff, 1.1); // soft studio key from the open (camera) side
    this.key.position.set(2.5, 4.2, -4.5);
    this.key.target.position.set(0, 0.6, 0.4);
    this.key.castShadow = false; // the sun casts the shadows for the whole house
    this.scene.add(this.key, this.key.target);

    // ---- post-processing
    const size = new THREE.Vector2();
    r.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, Math.round(size.x / 2), Math.round(size.y / 2)); // AO at half resolution
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.22, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.4, 4.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.quality = 'high';
    // big or high-density screens start without ambient occlusion
    if (size.x * size.y > 3.2e6) { this.quality = 'medium'; this.gtao.enabled = false; }
    this.fpsSamples = [];
    this.clock = new THREE.Clock();
    this.timeOfDay = null; // null = follow the real clock
    this.dayCycle = false;

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    this.gtao.setSize(Math.round(size.x / 2), Math.round(size.y / 2));
  }

  attachRoom(room, house) {
    this.room = room;
    this.house = house;
  }

  /** Hours 0..24. Moves the sun, recolours the sky, turns lamps on at night. */
  setTime(hours) {
    const room = this.room;
    const h = ((hours % 24) + 24) % 24;
    const dayK = THREE.MathUtils.clamp(Math.sin(((h - 6) / 12) * Math.PI), -1, 1); // 1 noon, 0 dawn/dusk, <0 night
    const day = THREE.MathUtils.smoothstep(dayK, -0.15, 0.35);
    const dusk = Math.max(0, 1 - Math.abs(dayK) * 4) * (dayK > -0.3 ? 1 : 0);
    const night = 1 - day;

    const sunAng = ((h - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(-0.35 + Math.cos(sunAng) * 0.45, 0.15 + Math.max(0.08, Math.sin(sunAng)) * 0.8, 0.75).normalize();
    this.sun.position.copy(this.sunCenter).addScaledVector(sunDir, 28);
    this.sun.intensity = 3.4 * day;
    this.sun.color.setRGB(1, lerp(0.62, 0.95, day * (1 - dusk)), lerp(0.4, 0.86, day * (1 - dusk)));
    this.key.intensity = lerp(0.35, 1.1, day);
    this.hemi.intensity = lerp(0.18, 0.55, day);
    this.hemi.color.setRGB(lerp(0.55, 0.95, day), lerp(0.6, 0.96, day), lerp(0.85, 1, day));
    this.scene.environmentIntensity = lerp(0.18, 0.5, day);
    this.renderer.toneMappingExposure = lerp(0.95, 1.0, day);
    this.bg.setRGB(lerp(0.09, 0.89, day), lerp(0.1, 0.91, day), lerp(0.15, 0.94, day));

    const u = this.house.sky.uniforms;
    u.top.value.setRGB(lerp(0.02, 0.33, day) + dusk * 0.2, lerp(0.03, 0.6, day), lerp(0.1, 1.0, day));
    u.bottom.value.setRGB(lerp(0.08, 0.82, day) + dusk * 0.35, lerp(0.07, 0.9, day) - dusk * 0.15, lerp(0.16, 1.0, day) - dusk * 0.35);
    u.sunDir.value.copy(sunDir);
    u.sunColor.value.setRGB(1, lerp(0.55, 0.95, 1 - dusk), lerp(0.35, 0.85, 1 - dusk)).multiplyScalar(day > 0.05 ? 1 : 0.0);
    u.stars.value = THREE.MathUtils.smoothstep(night, 0.5, 1);

    const lampOn = THREE.MathUtils.smoothstep(night, 0.25, 0.7);
    room.lamp.light.intensity = 9 * lampOn;
    room.lamp.bulb.emissiveIntensity = 0.2 + 6 * lampOn;
    room.lamp.shade.emissiveIntensity = 0.5 * lampOn;
    room.neon.light.intensity = 0.25 + 1.2 * night;
    room.screenLight.intensity = 0.12 + 0.5 * night;
    for (const l of this.house.lights) l.intensity = 6 * lampOn;
    this.house.chargeGlow.emissiveIntensity = 0.4 + 1.6 * night;
    this.hours = h;
    this.night = night;
  }

  /**
   * Keep watching the frame rate and step quality down (never up) until it holds ~50 fps:
   * high -> no ambient occlusion -> lower resolution, cheaper shadows, no bloom.
   */
  adapt(dt) {
    if (this.quality === 'fixed' || document.hidden) return;
    this.warm = (this.warm || 0) + dt;
    if (this.warm < 2) return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length < 60) return;
    const sorted = [...this.fpsSamples].sort((x, y) => x - y);
    const median = sorted[sorted.length >> 1];
    this.fpsSamples = [];
    if (median < 1 / 48) return;
    if (this.quality === 'high') {
      this.quality = 'medium';
      this.gtao.enabled = false;
    } else if (this.quality === 'medium') {
      this.quality = 'low';
      this.renderer.setPixelRatio(1);
      this.resize();
    } else if (this.quality === 'low') {
      this.quality = 'lowest';
      this.bloom.enabled = false;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.key.castShadow = false;
      this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
    console.info(`[Mr. Agent] render quality -> ${this.quality} (median frame ${(median * 1000).toFixed(1)} ms)`);
  }

  render() {
    this.composer.render();
  }
}
