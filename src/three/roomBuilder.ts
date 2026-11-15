import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { MirrorConfig, MirrorId, ROOM_MIRRORS } from "../types/mirror";
import {
  BuiltJellyfish,
  createBioluminescentJellyfish,
} from "./bioluminescentCreatures";
import { createMirrorSurfaceMaterial } from "./mirrorShader";
import {
  createPlaqueTexture,
  createRugTexture,
  createWallPlasterTexture,
  createWoodFloorTextures,
} from "./proceduralTextures";

export interface BuiltMirrorRig {
  config: MirrorConfig;
  group: THREE.Group;
  glassMesh: THREE.Mesh;
  hitProxy: THREE.Mesh;
  material: THREE.ShaderMaterial;
  reflector: Reflector | null;
  auraRing: THREE.Mesh;
  sconceGlow: THREE.MeshStandardMaterial;
  worldNormal: THREE.Vector3;
}

export interface BuiltRoom {
  mirrors: Map<MirrorId, BuiltMirrorRig>;
  hitProxies: THREE.Mesh[];
  whaleSculpture: THREE.Group;
  dustPoints: THREE.Points;
  marineSnowMaterial: THREE.ShaderMaterial;
  jellyfish: BuiltJellyfish[];
  dispose: () => void;
}

function normalizePlanarUVs(
  geometry: THREE.BufferGeometry,
  width: number,
  height: number
) {
  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uvs[i * 2] = x / width + 0.5;
    uvs[i * 2 + 1] = y / height + 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function createMirrorGlassShape(
  shapeType: MirrorConfig["shape"],
  width: number,
  height: number
): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;

  if (shapeType === "circle") {
    shape.absarc(0, 0, hw, 0, Math.PI * 2, false);
  } else if (shapeType === "oval") {
    shape.absellipse(0, 0, hw, hh, 0, Math.PI * 2, false, 0);
  } else if (shapeType === "octagon") {
    const cut = hw * 0.42;
    const pts: [number, number][] = [
      [-hw + cut, -hh],
      [hw - cut, -hh],
      [hw, -hh + cut],
      [hw, hh - cut],
      [hw - cut, hh],
      [-hw + cut, hh],
      [-hw, hh - cut],
      [-hw, -hh + cut],
    ];
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i][0], pts[i][1]);
    }
    shape.closePath();
  } else {
    // Arch shape: flat bottom, straight sides, semicircular arch top
    const archCenterY = hh - hw;
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, archCenterY);
    shape.absarc(0, archCenterY, hw, 0, Math.PI, false);
    shape.lineTo(-hw, -hh);
  }

  return shape;
}

function createFrameRingGeometry(
  shapeType: MirrorConfig["shape"],
  innerW: number,
  innerH: number,
  border: number,
  depth: number
): THREE.ExtrudeGeometry {
  const outer = createMirrorGlassShape(
    shapeType,
    innerW + border * 2,
    innerH + border * 2
  );
  const hole = createMirrorGlassShape(shapeType, innerW, innerH);
  outer.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 3,
    curveSegments: 42,
  });
  geo.center();
  return geo;
}

function buildCentralWhaleSculpture(
  disposables: { dispose: () => void }[]
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0, 0);

  // Soft contact shadow directly under the pedestal
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext("2d")!;
  const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  grad.addColorStop(0.65, "rgba(0, 0, 0, 0.22)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  group.add(contactShadow);
  disposables.push(shadowTex, contactShadow.geometry, contactShadow.material);

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x262f3b,
    roughness: 0.82,
    metalness: 0.08,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc29b57,
    roughness: 0.26,
    metalness: 0.92,
  });
  const bronzeWhaleMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a4d69,
    roughness: 0.24,
    metalness: 0.78,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
  });
  disposables.push(stoneMat, brassMat, bronzeWhaleMat);

  // 1. Stepped circular base (grounded flush at y = 0)
  const baseGeo = new THREE.CylinderGeometry(0.86, 0.94, 0.14, 48);
  const baseMesh = new THREE.Mesh(baseGeo, stoneMat);
  baseMesh.position.y = 0.07;
  baseMesh.receiveShadow = true;
  baseMesh.castShadow = true;
  group.add(baseMesh);

  // 2. Lathe column shaft
  const profile = [
    new THREE.Vector2(0.66, 0.14),
    new THREE.Vector2(0.58, 0.22),
    new THREE.Vector2(0.42, 0.34),
    new THREE.Vector2(0.38, 0.84),
    new THREE.Vector2(0.52, 0.96),
    new THREE.Vector2(0.56, 1.02),
    new THREE.Vector2(0.0, 1.02),
  ];
  const columnGeo = new THREE.LatheGeometry(profile, 40);
  const columnMesh = new THREE.Mesh(columnGeo, stoneMat);
  columnMesh.castShadow = true;
  columnMesh.receiveShadow = true;
  group.add(columnMesh);

  // 3. Brass collar rings
  const collar1 = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.022, 16, 48),
    brassMat
  );
  collar1.rotation.x = Math.PI / 2;
  collar1.position.y = 0.22;
  group.add(collar1);

  const collar2 = new THREE.Mesh(
    new THREE.TorusGeometry(0.54, 0.024, 16, 48),
    brassMat
  );
  collar2.rotation.x = Math.PI / 2;
  collar2.position.y = 1.02;
  group.add(collar2);

  // 4. Sculpted Whale Tail Fluke (sub-group so it rotates gently)
  const sculpturePivot = new THREE.Group();
  sculpturePivot.position.y = 1.04;

  const stemGeo = new THREE.CylinderGeometry(0.09, 0.16, 0.34, 24);
  const stemMesh = new THREE.Mesh(stemGeo, bronzeWhaleMat);
  stemMesh.position.y = 0.16;
  stemMesh.castShadow = true;
  sculpturePivot.add(stemMesh);

  // Extruded curved whale fluke
  const flukeShape = new THREE.Shape();
  flukeShape.moveTo(0, 0.02);
  flukeShape.bezierCurveTo(-0.18, 0.05, -0.46, 0.18, -0.66, 0.42);
  flukeShape.bezierCurveTo(-0.48, 0.32, -0.22, 0.24, -0.04, 0.22);
  flukeShape.lineTo(0, 0.16);
  flukeShape.lineTo(0.04, 0.22);
  flukeShape.bezierCurveTo(0.22, 0.24, 0.48, 0.32, 0.66, 0.42);
  flukeShape.bezierCurveTo(0.46, 0.18, 0.18, 0.05, 0, 0.02);

  const flukeGeo = new THREE.ExtrudeGeometry(flukeShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 24,
  });
  flukeGeo.center();
  const flukeMesh = new THREE.Mesh(flukeGeo, bronzeWhaleMat);
  flukeMesh.position.set(0, 0.46, 0);
  flukeMesh.rotation.x = -0.18;
  flukeMesh.castShadow = true;
  sculpturePivot.add(flukeMesh);

  // Orbiting brass astrolabe ring around the fluke
  const astrolabeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.56, 0.012, 12, 64),
    brassMat
  );
  astrolabeRing.position.y = 0.44;
  astrolabeRing.rotation.set(0.35, 0.2, 0);
  sculpturePivot.add(astrolabeRing);

  group.add(sculpturePivot);
  group.userData.sculpturePivot = sculpturePivot;

  disposables.push(
    baseGeo,
    columnGeo,
    collar1.geometry,
    collar2.geometry,
    stemGeo,
    flukeGeo,
    astrolabeRing.geometry
  );

  return group;
}

function buildMirrorRig(
  config: MirrorConfig,
  maxAniso: number,
  isSoftwareGl: boolean,
  disposables: { dispose: () => void }[]
): BuiltMirrorRig {
  const group = new THREE.Group();
  group.position.set(...config.position);
  group.rotation.y = config.rotationY;

  const [glassW, glassH] = config.glassSize;
  const mirrorAspect = glassW / glassH;

  // Frame materials by style (calibrated roughness/metalness contrast)
  const frameConfigs: Record<
    MirrorConfig["frameStyle"],
    { outerColor: number; outerRough: number; outerMetal: number; innerColor: number }
  > = {
    brass: {
      outerColor: 0xb68b48,
      outerRough: 0.28,
      outerMetal: 0.92,
      innerColor: 0x3b2d1a,
    },
    walnut: {
      outerColor: 0x3c271c,
      outerRough: 0.62,
      outerMetal: 0.08,
      innerColor: 0xc29e63,
    },
    steel: {
      outerColor: 0x5c6b7c,
      outerRough: 0.3,
      outerMetal: 0.88,
      innerColor: 0x1a2634,
    },
    pearl: {
      outerColor: 0x9aa4ad,
      outerRough: 0.45,
      outerMetal: 0.25,
      innerColor: 0xd8cfc2,
    },
  };
  const fc = frameConfigs[config.frameStyle];

  const outerMat = new THREE.MeshStandardMaterial({
    color: fc.outerColor,
    roughness: fc.outerRough,
    metalness: fc.outerMetal,
  });
  const innerMat = new THREE.MeshStandardMaterial({
    color: fc.innerColor,
    roughness: fc.outerRough > 0.5 ? 0.25 : 0.72,
    metalness: fc.outerMetal > 0.5 ? 0.15 : 0.85,
  });
  const backingMat = new THREE.MeshStandardMaterial({
    color: 0x11161f,
    roughness: 0.9,
    metalness: 0.1,
  });
  disposables.push(outerMat, innerMat, backingMat);

  // 1. Outer molded frame
  const outerGeo = createFrameRingGeometry(
    config.shape,
    glassW + 0.06,
    glassH + 0.06,
    0.13,
    0.09
  );
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  outerMesh.position.z = 0.06;
  outerMesh.castShadow = true;
  outerMesh.receiveShadow = true;
  group.add(outerMesh);
  disposables.push(outerGeo);

  // 2. Inner beveled fillet
  const innerGeo = createFrameRingGeometry(
    config.shape,
    glassW,
    glassH,
    0.045,
    0.06
  );
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  innerMesh.position.z = 0.075;
  group.add(innerMesh);
  disposables.push(innerGeo);

  // 3. Backing plate behind glass
  const glassShape = createMirrorGlassShape(config.shape, glassW, glassH);
  const glassGeo = new THREE.ShapeGeometry(glassShape, 48);
  normalizePlanarUVs(glassGeo, glassW, glassH);
  disposables.push(glassGeo);

  const backMesh = new THREE.Mesh(glassGeo, backingMat);
  backMesh.position.z = 0.03;
  group.add(backMesh);

  // 4. Interactive custom ShaderMaterial mirror glass
  const shaderMat = createMirrorSurfaceMaterial(config.accentHex, mirrorAspect);
  const glassMesh = new THREE.Mesh(glassGeo, shaderMat);
  glassMesh.position.z = 0.068;
  group.add(glassMesh);
  disposables.push(shaderMat);

  // 5. Optional real-time planar Reflector (active only on nearest idle mirror on GPU)
  let reflector: Reflector | null = null;
  if (!isSoftwareGl) {
    reflector = new Reflector(glassGeo, {
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      color: 0x8ea4b8,
    });
    reflector.position.z = 0.071;
    reflector.visible = false;
    group.add(reflector);
  }

  // 6. Perimeter rivets / finials
  const accentGeo = new THREE.SphereGeometry(0.022, 12, 12);
  disposables.push(accentGeo);
  const studCount = config.shape === "circle" ? 12 : 8;
  for (let i = 0; i < studCount; i++) {
    const angle = (i / studCount) * Math.PI * 2;
    const rx = (glassW / 2 + 0.12) * Math.cos(angle);
    const ry = (glassH / 2 + 0.12) * Math.sin(angle);
    const stud = new THREE.Mesh(accentGeo, innerMat);
    stud.position.set(rx, ry, 0.11);
    group.add(stud);
  }

  // 7. Hanging hardware (wall rosette + brass wire)
  const hookGeo = new THREE.CylinderGeometry(0.036, 0.044, 0.04, 18);
  const hookMesh = new THREE.Mesh(hookGeo, outerMat);
  hookMesh.rotation.x = Math.PI / 2;
  hookMesh.position.set(0, glassH / 2 + 0.42, 0.02);
  group.add(hookMesh);
  disposables.push(hookGeo);

  const wirePoints = [
    new THREE.Vector3(-glassW * 0.25, glassH / 2 + 0.12, 0.04),
    new THREE.Vector3(0, glassH / 2 + 0.42, 0.03),
    new THREE.Vector3(glassW * 0.25, glassH / 2 + 0.12, 0.04),
  ];
  const wireCurve = new THREE.CatmullRomCurve3(wirePoints);
  const wireGeo = new THREE.TubeGeometry(wireCurve, 12, 0.006, 6, false);
  const wireMesh = new THREE.Mesh(wireGeo, innerMat);
  group.add(wireMesh);
  disposables.push(wireGeo);

  // 8. Wall sconce fixture above the mirror
  const sconceMount = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.055, 0.18),
    outerMat
  );
  sconceMount.position.set(0, glassH / 2 + 0.56, 0.09);
  group.add(sconceMount);

  const sconceGlow = new THREE.MeshStandardMaterial({
    color: 0xffeed8,
    emissive: new THREE.Color(0xffc98b),
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });
  const sconceBulb = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.025, 0.08),
    sconceGlow
  );
  sconceBulb.position.set(0, glassH / 2 + 0.525, 0.13);
  group.add(sconceBulb);
  disposables.push(sconceMount.geometry, sconceGlow, sconceBulb.geometry);

  // 9. Engraved brass plaque below the mirror
  const plaqueTex = createPlaqueTexture(config.name, config.subtitle, maxAniso);
  const plaqueMat = new THREE.MeshStandardMaterial({
    map: plaqueTex,
    roughness: 0.4,
    metalness: 0.6,
  });
  const plaqueGeo = new THREE.BoxGeometry(0.84, 0.21, 0.025);
  const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaqueMesh.position.set(0, -glassH / 2 - 0.34, 0.015);
  group.add(plaqueMesh);
  disposables.push(plaqueTex, plaqueMat, plaqueGeo);

  // 10. Subtle proximity glow ring around mirror perimeter
  const auraGeo = createFrameRingGeometry(
    config.shape,
    glassW + 0.32,
    glassH + 0.32,
    0.022,
    0.01
  );
  const auraMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(config.accentHex),
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const auraRing = new THREE.Mesh(auraGeo, auraMat);
  auraRing.position.z = 0.015;
  group.add(auraRing);
  disposables.push(auraGeo, auraMat);

  // 11. Raycast hit proxy on layer 1
  const proxyGeo = new THREE.BoxGeometry(glassW + 0.45, glassH + 0.65, 0.35);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitProxy = new THREE.Mesh(proxyGeo, proxyMat);
  hitProxy.position.set(0, 0, 0.12);
  hitProxy.layers.set(1);
  hitProxy.userData.mirrorId = config.id;
  group.add(hitProxy);
  disposables.push(proxyGeo, proxyMat);

  const worldNormal = new THREE.Vector3(0, 0, 1).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    config.rotationY
  );

  return {
    config,
    group,
    glassMesh,
    hitProxy,
    material: shaderMat,
    reflector,
    auraRing,
    sconceGlow,
    worldNormal,
  };
}

export function buildRoomScene(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): BuiltRoom {
  const disposables: { dispose: () => void }[] = [];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // Room dimensions: 13m x 13m, 4.5m tall
  const roomW = 13.0;
  const roomH = 4.5;
  const half = roomW / 2;

  // Floor
  const wood = createWoodFloorTextures(maxAniso);
  const floorMat = new THREE.MeshStandardMaterial({
    map: wood.map,
    roughnessMap: wood.roughnessMap,
    roughness: 0.72,
    metalness: 0.05,
  });
  const floorGeo = new THREE.PlaneGeometry(roomW, roomW);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);
  disposables.push(wood.map, wood.roughnessMap, floorMat, floorGeo);

  // Circular woven rug (offset +0.02 on Y to prevent Z-fighting)
  const rugTex = createRugTexture(maxAniso);
  const rugMat = new THREE.MeshStandardMaterial({
    map: rugTex,
    roughness: 0.94,
    metalness: 0.0,
  });
  const rugGeo = new THREE.CircleGeometry(2.65, 64);
  const rug = new THREE.Mesh(rugGeo, rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.02;
  rug.receiveShadow = true;
  scene.add(rug);
  disposables.push(rugTex, rugMat, rugGeo);

  // Walls
  const wallTex = createWallPlasterTexture(maxAniso);
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.86,
    metalness: 0.04,
  });
  const wallGeo = new THREE.PlaneGeometry(roomW, roomH);
  disposables.push(wallTex, wallMat, wallGeo);

  const wallTransforms: [number, number, number, number][] = [
    [0, roomH / 2, -half, 0], // North
    [0, roomH / 2, half, Math.PI], // South
    [-half, roomH / 2, 0, Math.PI / 2], // West
    [half, roomH / 2, 0, -Math.PI / 2], // East
  ];
  for (const [wx, wy, wz, ry] of wallTransforms) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(wx, wy, wz);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  // Baseboards & crown moldings
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x161b24,
    roughness: 0.55,
    metalness: 0.15,
  });
  const baseGeo = new THREE.BoxGeometry(roomW, 0.18, 0.08);
  const crownGeo = new THREE.BoxGeometry(roomW, 0.14, 0.12);
  disposables.push(trimMat, baseGeo, crownGeo);

  for (const [wx, , wz, ry] of wallTransforms) {
    const base = new THREE.Mesh(baseGeo, trimMat);
    base.position.set(wx, 0.09, wz);
    base.rotation.y = ry;
    scene.add(base);

    const crown = new THREE.Mesh(crownGeo, trimMat);
    crown.position.set(wx, roomH - 0.07, wz);
    crown.rotation.y = ry;
    scene.add(crown);
  }

  // Ceiling & skylight beams
  const ceilingGeo = new THREE.PlaneGeometry(roomW, roomW);
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x101722,
    roughness: 0.9,
    metalness: 0.05,
  });
  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = roomH;
  scene.add(ceiling);
  disposables.push(ceilingGeo, ceilingMat);

  // Recessed central skylight glow panel
  const skyGeo = new THREE.PlaneGeometry(4.2, 4.2);
  const skyMat = new THREE.MeshBasicMaterial({
    color: 0x264869,
  });
  const skylight = new THREE.Mesh(skyGeo, skyMat);
  skylight.rotation.x = Math.PI / 2;
  skylight.position.y = roomH - 0.02;
  scene.add(skylight);
  disposables.push(skyGeo, skyMat);

  const beamGeo = new THREE.BoxGeometry(roomW, 0.18, 0.24);
  disposables.push(beamGeo);
  for (const bz of [-4.2, -2.2, 2.2, 4.2]) {
    const beam = new THREE.Mesh(beamGeo, trimMat);
    beam.position.set(0, roomH - 0.09, bz);
    scene.add(beam);
  }

  // Central whale fluke sculpture
  const whaleSculpture = buildCentralWhaleSculpture(disposables);
  scene.add(whaleSculpture);

  // Swirling deep-ocean silt & marine snow particle system (GPU ShaderMaterial)
  const moteCount = 460;
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount * 3);
  const moteSize = new Float32Array(moteCount);

  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 11.6;
    motePos[i * 3 + 1] = 0.2 + Math.random() * 4.0;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 11.6;

    moteSeed[i * 3] = Math.random() * Math.PI * 2; // phase
    moteSeed[i * 3 + 1] = 0.55 + Math.random() * 0.9; // eddy speed/radius factor
    moteSeed[i * 3 + 2] = Math.random(); // tint/luminance seed

    // Mix tiny abyssal silt specks with slightly larger soft marine snow flecks
    moteSize[i] = Math.random() < 0.72
      ? 0.55 + Math.random() * 0.65
      : 1.2 + Math.random() * 0.95;
  }

  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute("aSeed", new THREE.BufferAttribute(moteSeed, 3));
  moteGeo.setAttribute("aSize", new THREE.BufferAttribute(moteSize, 1));

  const marineSnowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uSpeechEnergy: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aSeed;
      attribute float aSize;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uSpeechEnergy;

      varying float vAlpha;
      varying float vTint;
      varying float vPhase;

      void main() {
        float phase = aSeed.x;
        float rate = aSeed.y;
        vTint = aSeed.z;
        vPhase = phase;

        vec3 p = position;

        // Gentle downward marine snow drift with seamless vertical wrap (0.2 .. 4.2m)
        float minY = 0.2;
        float spanY = 4.0;
        float fallSpeed = 0.032 * rate;
        float wrappedY = mod(p.y - minY - uTime * fallSpeed, spanY) + minY;

        // Subtle room-wide underwater current swirl + localized eddies
        float t = uTime * (0.22 + 0.14 * rate) + phase;
        float swirlAngle = uTime * 0.045 + wrappedY * 0.28;
        float s = sin(swirlAngle);
        float c = cos(swirlAngle);
        vec2 rotatedXZ = vec2(p.x * c - p.z * s, p.x * s + p.z * c);

        // Multi-frequency curl-like drift in X/Y/Z
        float eddyX = sin(t + wrappedY * 1.45) * 0.34 + cos(t * 0.63 + p.z * 0.55) * 0.18;
        float eddyZ = cos(t * 0.92 + wrappedY * 1.25) * 0.34 + sin(t * 0.58 + p.x * 0.55) * 0.18;
        float bobY = sin(t * 0.8 + p.x * 0.6) * 0.08;

        vec3 displaced = vec3(
          rotatedXZ.x + eddyX,
          wrappedY + bobY,
          rotatedXZ.y + eddyZ
        );

        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float dist = max(0.8, -mvPosition.z);
        float basePx = (30.0 * aSize * uPixelRatio) / dist;
        gl_PointSize = clamp(basePx, 1.4, 15.0);

        // Soft fade near floor, ceiling, and camera near-plane so motes never pop
        float yNorm = (wrappedY - minY) / spanY;
        float edgeFade = smoothstep(0.0, 0.12, yNorm) * smoothstep(1.0, 0.85, yNorm);
        float nearFade = smoothstep(0.55, 1.85, dist);
        float farFade = 1.0 - smoothstep(8.5, 15.0, dist);
        float shimmer = 0.72 + 0.28 * sin(uTime * (0.9 + rate * 0.7) + phase * 2.0);

        vAlpha = edgeFade * nearFade * farFade * shimmer * (0.28 + uSpeechEnergy * 0.12);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vTint;
      varying float vPhase;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float r = length(uv);
        if (r > 0.5) discard;

        // Soft feathery marine snow / fine mineral silt falloff
        float softCore = smoothstep(0.5, 0.06, r);
        float halo = pow(softCore, 1.65);

        vec3 siltColor = vec3(0.76, 0.88, 0.96);      // Pale abyssal silt / snow
        vec3 bioTeal   = vec3(0.38, 0.88, 0.86);      // Faint bioluminescent plankton
        vec3 deepBlue  = vec3(0.52, 0.76, 0.98);      // Cool cerulean glint

        vec3 col = mix(siltColor, deepBlue, smoothstep(0.25, 0.75, vTint));
        col = mix(col, bioTeal, step(0.82, vTint) * 0.75);

        float alpha = halo * vAlpha * (0.75 + 0.25 * sin(vPhase));
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const dustPoints = new THREE.Points(moteGeo, marineSnowMaterial);
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);
  disposables.push(moteGeo, marineSnowMaterial);

  // Low-poly drifting bioluminescent jellyfish
  const jellyfish = createBioluminescentJellyfish(scene, disposables);

  // Build the 4 hanging mirrors
  const mirrors = new Map<MirrorId, BuiltMirrorRig>();
  const hitProxies: THREE.Mesh[] = [];

  for (const cfg of ROOM_MIRRORS) {
    const rig = buildMirrorRig(cfg, maxAniso, isSoftwareGl, disposables);
    scene.add(rig.group);
    mirrors.set(cfg.id, rig);
    hitProxies.push(rig.hitProxy);
  }

  return {
    mirrors,
    hitProxies,
    whaleSculpture,
    dustPoints,
    marineSnowMaterial,
    jellyfish,
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
