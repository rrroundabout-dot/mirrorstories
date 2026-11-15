import * as THREE from "three";

export interface BuiltJellyfish {
  root: THREE.Group;
  bellGroup: THREE.Group;
  tentacleGroup: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  bellMat: THREE.MeshPhysicalMaterial;
  basePos: THREE.Vector3;
  orbitRadiusX: number;
  orbitRadiusZ: number;
  bobAmplitudeY: number;
  driftSpeed: number;
  pulseSpeed: number;
  phase: number;
  scale: number;
}

interface JellyfishPreset {
  bellColor: number;
  emissiveColor: number;
  coreColor: number;
  basePos: [number, number, number];
  orbitRadiusX: number;
  orbitRadiusZ: number;
  bobAmplitudeY: number;
  driftSpeed: number;
  pulseSpeed: number;
  phase: number;
  scale: number;
}

const JELLYFISH_PRESETS: JellyfishPreset[] = [
  {
    // Cyan-teal moon jelly drifting high in the north-east quadrant
    bellColor: 0x38bdf8,
    emissiveColor: 0x0ea5e9,
    coreColor: 0x67e8f9,
    basePos: [2.6, 2.95, -2.5],
    orbitRadiusX: 1.55,
    orbitRadiusZ: 1.35,
    bobAmplitudeY: 0.28,
    driftSpeed: 0.14,
    pulseSpeed: 1.45,
    phase: 0.2,
    scale: 1.05,
  },
  {
    // Bioluminescent emerald-seafoam jelly drifting in the south-west quadrant
    bellColor: 0x2dd4bf,
    emissiveColor: 0x14b8a6,
    coreColor: 0x99f6e4,
    basePos: [-2.8, 2.75, 2.4],
    orbitRadiusX: 1.45,
    orbitRadiusZ: 1.65,
    bobAmplitudeY: 0.32,
    driftSpeed: 0.11,
    pulseSpeed: 1.28,
    phase: 1.9,
    scale: 0.92,
  },
  {
    // Deep violet-indigo comb jelly drifting high in the north-west quadrant
    bellColor: 0x818cf8,
    emissiveColor: 0x6366f1,
    coreColor: 0xc7d2fe,
    basePos: [-2.4, 3.3, -2.7],
    orbitRadiusX: 1.6,
    orbitRadiusZ: 1.3,
    bobAmplitudeY: 0.24,
    driftSpeed: 0.13,
    pulseSpeed: 1.6,
    phase: 3.4,
    scale: 0.82,
  },
  {
    // Pale cerulean-rose deep jelly drifting in the south-east quadrant
    bellColor: 0x60a5fa,
    emissiveColor: 0x3b82f6,
    coreColor: 0xe0f2fe,
    basePos: [2.5, 3.15, 2.6],
    orbitRadiusX: 1.35,
    orbitRadiusZ: 1.55,
    bobAmplitudeY: 0.26,
    driftSpeed: 0.12,
    pulseSpeed: 1.35,
    phase: 4.8,
    scale: 0.96,
  },
  {
    // Smaller golden-amber abyssal lantern jelly gliding near skylight canopy
    bellColor: 0x34d399,
    emissiveColor: 0x10b981,
    coreColor: 0xfde68a,
    basePos: [0.0, 3.55, -0.4],
    orbitRadiusX: 2.2,
    orbitRadiusZ: 2.2,
    bobAmplitudeY: 0.22,
    driftSpeed: 0.095,
    pulseSpeed: 1.52,
    phase: 2.7,
    scale: 0.72,
  },
];

export function createBioluminescentJellyfish(
  scene: THREE.Scene,
  disposables: { dispose: () => void }[]
): BuiltJellyfish[] {
  // Shared low-poly bell profile (10-sided faceted dome)
  const bellProfile = [
    new THREE.Vector2(0.0, 0.28),
    new THREE.Vector2(0.14, 0.26),
    new THREE.Vector2(0.28, 0.17),
    new THREE.Vector2(0.34, 0.04),
    new THREE.Vector2(0.31, -0.05),
  ];
  const bellGeo = new THREE.LatheGeometry(bellProfile, 10);
  const rimGeo = new THREE.TorusGeometry(0.305, 0.022, 5, 10);
  const coreGeo = new THREE.OctahedronGeometry(0.11, 0);

  // Low-poly curved tentacle geometries
  const outerTentacleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.03, -0.22, 0.02),
    new THREE.Vector3(-0.04, -0.48, -0.02),
    new THREE.Vector3(0.02, -0.76, 0.03),
  ]);
  const outerTentacleGeo = new THREE.TubeGeometry(
    outerTentacleCurve,
    9,
    0.011,
    4,
    false
  );

  const innerArmCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0),
    new THREE.Vector3(-0.03, -0.18, 0.03),
    new THREE.Vector3(0.03, -0.36, -0.02),
    new THREE.Vector3(0.0, -0.52, 0.01),
  ]);
  const innerArmGeo = new THREE.TubeGeometry(
    innerArmCurve,
    7,
    0.021,
    4,
    false
  );

  disposables.push(
    bellGeo,
    rimGeo,
    coreGeo,
    outerTentacleGeo,
    innerArmGeo
  );

  const creatures: BuiltJellyfish[] = [];

  for (const preset of JELLYFISH_PRESETS) {
    const root = new THREE.Group();
    root.position.set(...preset.basePos);
    root.scale.setScalar(preset.scale);

    const bellMat = new THREE.MeshPhysicalMaterial({
      color: preset.bellColor,
      emissive: new THREE.Color(preset.emissiveColor),
      emissiveIntensity: 0.72,
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.75,
      clearcoatRoughness: 0.15,
      transparent: true,
      opacity: 0.52,
      flatShading: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const coreMat = new THREE.MeshStandardMaterial({
      color: preset.coreColor,
      emissive: new THREE.Color(preset.coreColor),
      emissiveIntensity: 1.45,
      roughness: 0.35,
      metalness: 0.05,
      flatShading: true,
    });

    const tentacleMat = new THREE.MeshStandardMaterial({
      color: preset.bellColor,
      emissive: new THREE.Color(preset.emissiveColor),
      emissiveIntensity: 0.62,
      roughness: 0.45,
      metalness: 0.02,
      transparent: true,
      opacity: 0.68,
      flatShading: true,
      depthWrite: false,
    });

    disposables.push(bellMat, coreMat, tentacleMat);

    const bellGroup = new THREE.Group();
    const bellMesh = new THREE.Mesh(bellGeo, bellMat);
    bellGroup.add(bellMesh);

    const rimMesh = new THREE.Mesh(rimGeo, coreMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = -0.04;
    bellGroup.add(rimMesh);

    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.y = 0.09;
    bellGroup.add(coreMesh);

    const tentacleGroup = new THREE.Group();
    tentacleGroup.position.y = -0.04;

    // 5 outer trailing low-poly tentacles
    const tentacleCount = 5;
    for (let i = 0; i < tentacleCount; i++) {
      const angle = (i / tentacleCount) * Math.PI * 2;
      const tMesh = new THREE.Mesh(outerTentacleGeo, tentacleMat);
      tMesh.position.set(Math.cos(angle) * 0.21, 0, Math.sin(angle) * 0.21);
      tMesh.rotation.y = angle;
      tentacleGroup.add(tMesh);
    }

    // 2 central thicker oral arms
    for (let i = 0; i < 2; i++) {
      const angle = i * Math.PI + 0.5;
      const armMesh = new THREE.Mesh(innerArmGeo, coreMat);
      armMesh.position.set(Math.cos(angle) * 0.06, 0.02, Math.sin(angle) * 0.06);
      armMesh.rotation.y = angle;
      tentacleGroup.add(armMesh);
    }

    root.add(bellGroup);
    root.add(tentacleGroup);
    scene.add(root);

    creatures.push({
      root,
      bellGroup,
      tentacleGroup,
      coreMat,
      bellMat,
      basePos: new THREE.Vector3(...preset.basePos),
      orbitRadiusX: preset.orbitRadiusX,
      orbitRadiusZ: preset.orbitRadiusZ,
      bobAmplitudeY: preset.bobAmplitudeY,
      driftSpeed: preset.driftSpeed,
      pulseSpeed: preset.pulseSpeed,
      phase: preset.phase,
      scale: preset.scale,
    });
  }

  return creatures;
}

export function updateBioluminescentJellyfish(
  creatures: BuiltJellyfish[],
  elapsed: number,
  speechEnergy: number
): void {
  for (const jelly of creatures) {
    const t = elapsed * jelly.driftSpeed + jelly.phase;

    // Smooth figure-8 / orbital drift through the upper gallery
    const x =
      jelly.basePos.x +
      Math.cos(t) * jelly.orbitRadiusX +
      Math.sin(t * 0.5) * 0.35;
    const z =
      jelly.basePos.z +
      Math.sin(t * 0.85) * jelly.orbitRadiusZ +
      Math.cos(t * 0.4) * 0.3;
    const y =
      jelly.basePos.y +
      Math.sin(elapsed * jelly.pulseSpeed * 0.5 + jelly.phase) *
        jelly.bobAmplitudeY;

    jelly.root.position.set(x, y, z);

    // Frame-rate independent gentle tilt into direction of travel
    const vx =
      (-Math.sin(t) * jelly.orbitRadiusX + Math.cos(t * 0.5) * 0.175) *
      jelly.driftSpeed;
    const vz =
      (Math.cos(t * 0.85) * 0.85 * jelly.orbitRadiusZ -
        Math.sin(t * 0.4) * 0.12) *
      jelly.driftSpeed;
    jelly.root.rotation.z = THREE.MathUtils.clamp(-vx * 0.65, -0.26, 0.26);
    jelly.root.rotation.x = THREE.MathUtils.clamp(vz * 0.65, -0.26, 0.26);
    jelly.root.rotation.y = elapsed * 0.12 + jelly.phase;

    // Rhythmic umbrella contraction pulse
    const rawPulse = Math.sin(elapsed * jelly.pulseSpeed + jelly.phase);
    const pulse = 0.5 + 0.5 * rawPulse;
    const bellXZ = 1.0 - pulse * 0.14;
    const bellY = 1.0 + pulse * 0.17;
    jelly.bellGroup.scale.set(bellXZ, bellY, bellXZ);

    // Trailing tentacle sway slightly behind the bell pulse
    const trail = Math.sin(elapsed * jelly.pulseSpeed + jelly.phase - 0.85);
    jelly.tentacleGroup.rotation.x = trail * 0.12;
    jelly.tentacleGroup.rotation.z =
      Math.cos(elapsed * jelly.pulseSpeed * 0.7 + jelly.phase) * 0.1;
    jelly.tentacleGroup.scale.y = 1.0 + (1.0 - pulse) * 0.14;

    // Subtle bioluminescent breathing (gently amplified during storytelling)
    const glowBoost = 1.0 + speechEnergy * 0.45;
    jelly.coreMat.emissiveIntensity = (1.15 + pulse * 0.85) * glowBoost;
    jelly.bellMat.emissiveIntensity = (0.58 + pulse * 0.36) * glowBoost;
  }
}
