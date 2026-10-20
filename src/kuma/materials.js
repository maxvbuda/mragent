import * as THREE from 'three';

// Shared materials. The robot follows the reference picture: glossy white
// shells, bright chrome joints and a black glass visor with a cyan glow.

export const mats = {
  shell: new THREE.MeshPhysicalMaterial({
    color: 0xf2f4f7,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.09,
  }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xf1f4f8, metalness: 1, roughness: 0.13 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xaab2bc, metalness: 1, roughness: 0.28 }),
  joint: new THREE.MeshStandardMaterial({ color: 0x3b4149, metalness: 0.7, roughness: 0.36 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1c1f24, metalness: 0, roughness: 0.78 }),
  palmPad: new THREE.MeshStandardMaterial({ color: 0x2a2f37, metalness: 0.2, roughness: 0.6 }),
  // Glowing accents; the colour follows the robot's mood.
  led: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3fe6ff, emissiveIntensity: 4.8 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x07090c,
    roughness: 0.06,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  }),
};

export const moodColours = {
  work: new THREE.Color(0x35e2ff),
  angry: new THREE.Color(0xff2b1f),
  chill: new THREE.Color(0xb07bff),
  dizzy: new THREE.Color(0xffb627),
};
