import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  GeneratedFaceInfo,
  MirrorActivityState,
  MirrorId,
  ProximitySnapshot,
  ROOM_MIRRORS,
} from "../types/mirror";
import { updateBioluminescentJellyfish } from "./bioluminescentCreatures";
import { MirrorShaderUniforms } from "./mirrorShader";
import { ProceduralFaceGenerator } from "./proceduralTextures";
import { buildRoomScene, BuiltMirrorRig, BuiltRoom } from "./roomBuilder";

// Pre-allocated math helpers outside render loop (zero GC)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _toMirror = new THREE.Vector3();
const _camLookDir = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();

export interface MirrorEngineCallbacks {
  onProximityChange: (snap: ProximitySnapshot) => void;
  onMirrorClick: (mirrorId: MirrorId) => void;
  onContextLost: (lost: boolean) => void;
  getAudioBands: () => { level: number; low: number; high: number };
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class MirrorGalleryEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: MirrorEngineCallbacks;
  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly fog: THREE.FogExp2;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly room: BuiltRoom;
  private readonly clock = new THREE.Clock();

  private frameId = 0;
  private disposed = false;

  // Player & camera navigation state
  private playerPos = new THREE.Vector3(0, 1.65, 2.35);
  private yaw = 0; // 0 looks toward -Z (North wall)
  private pitch = -0.02;
  private targetWalkPos: THREE.Vector3 | null = null;
  private targetYaw: number | null = null;
  private targetPitch: number | null = null;

  // Input tracking
  private readonly keys = new Set<string>();
  private isDragging = false;
  private dragMoved = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private downPointerX = 0;
  private downPointerY = 0;

  // Active mirror media state
  private activeMirrorId: MirrorId | null = null;
  private mirrorState: MirrorActivityState = "idle";
  private faceGenerator: ProceduralFaceGenerator | null = null;
  private faceTexture: THREE.CanvasTexture | null = null;
  private snapshotTexture: THREE.Texture | null = null;
  private mediaAspect = 4 / 3;

  // Proximity tracking (throttled callbacks)
  private lastReportedMirrorId: MirrorId | null = null;
  private lastReportedInRange = false;
  private lastDistanceReportTime = 0;

  constructor(container: HTMLElement, callbacks: MirrorEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const abyssFogColor = 0x07111d;
    this.scene.background = new THREE.Color(abyssFogColor);
    this.fog = new THREE.FogExp2(abyssFogColor, 0.074);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 45);
    this.camera.position.copy(this.playerPos);
    _euler.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(_euler);

    // Mandatory studio environment reflection map
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-point warm/cool gallery lighting
    const hemi = new THREE.HemisphereLight(0x8bc4e8, 0x241a14, 0.92);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe7cc, 1.35);
    keyLight.position.set(3.2, 6.5, 2.8);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -7;
    keyLight.shadow.camera.right = 7;
    keyLight.shadow.camera.top = 7;
    keyLight.shadow.camera.bottom = -7;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x4ea8de, 0.65);
    rimLight.position.set(-4.5, 4.0, -4.5);
    this.scene.add(rimLight);

    // Warm overhead sconce pool in center
    const centerLight = new THREE.PointLight(0xffd6a5, 3.8, 12, 1.4);
    centerLight.position.set(0, 3.8, 0);
    this.scene.add(centerLight);

    this.room = buildRoomScene(this.scene, this.renderer, this.isSoftwareGl);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitProximity(true);
    this.tick();
  }

  private bindEvents() {
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = () => {
    this.callbacks.onContextLost(false);
  };

  private onResize = () => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    const pr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pr);
    this.room.marineSnowMaterial.uniforms.uPixelRatio.value = pr;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    this.keys.add(e.code);
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code)
    ) {
      this.targetWalkPos = null;
      this.targetYaw = null;
      this.targetPitch = null;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    this.isDragging = true;
    this.dragMoved = false;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.downPointerX = e.clientX;
    this.downPointerY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (
      Math.hypot(e.clientX - this.downPointerX, e.clientY - this.downPointerY) >
      5
    ) {
      this.dragMoved = true;
      this.targetYaw = null;
      this.targetPitch = null;
    }

    this.yaw -= dx * 0.0036;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * 0.003,
      -Math.PI * 0.34,
      Math.PI * 0.34
    );
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (!this.dragMoved) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.layers.set(1);
      _raycaster.setFromCamera(_pointerNdc, this.camera);
      const hits = _raycaster.intersectObjects(this.room.hitProxies, false);
      if (hits.length > 0) {
        const mirrorId = hits[0].object.userData.mirrorId as MirrorId | undefined;
        if (mirrorId) {
          this.focusMirror(mirrorId);
          this.callbacks.onMirrorClick(mirrorId);
        }
      }
    }
  };

  public focusMirror(mirrorId: MirrorId) {
    const cfg = ROOM_MIRRORS.find((m) => m.id === mirrorId);
    if (!cfg) return;
    this.targetWalkPos = new THREE.Vector3(...cfg.viewPoint);
    this.targetYaw = cfg.viewYaw;
    this.targetPitch = 0.02;
  }

  public activateFaceGenerator(mirrorId: MirrorId): GeneratedFaceInfo {
    if (!this.faceGenerator) {
      this.faceGenerator = new ProceduralFaceGenerator(640, 480);
    }
    const info = this.faceGenerator.randomize();

    if (!this.faceTexture) {
      const tex = new THREE.CanvasTexture(this.faceGenerator.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.faceTexture = tex;
    }
    this.faceTexture.needsUpdate = true;
    this.mediaAspect =
      this.faceGenerator.canvas.width / this.faceGenerator.canvas.height;

    this.activeMirrorId = mirrorId;
    this.mirrorState = "face_ready";
    this.syncMirrorUniforms();
    return info;
  }

  public regenerateFace(mirrorId: MirrorId): GeneratedFaceInfo {
    if (!this.faceGenerator || !this.faceTexture) {
      return this.activateFaceGenerator(mirrorId);
    }
    const info = this.faceGenerator.randomize();
    this.faceTexture.needsUpdate = true;
    this.activeMirrorId = mirrorId;
    this.mirrorState = "face_ready";
    this.syncMirrorUniforms();
    return info;
  }

  public getFaceCanvas(): HTMLCanvasElement | null {
    return this.faceGenerator ? this.faceGenerator.canvas : null;
  }

  public setSpeakingSnapshot(
    mirrorId: MirrorId,
    snapshotCanvas: HTMLCanvasElement,
    mouthCenter: { x: number; y: number }
  ): void {
    if (this.snapshotTexture) {
      this.snapshotTexture.dispose();
    }
    const snapTex = new THREE.CanvasTexture(snapshotCanvas);
    snapTex.colorSpace = THREE.SRGBColorSpace;
    snapTex.needsUpdate = true;
    this.snapshotTexture = snapTex;
    this.mediaAspect = snapshotCanvas.width / snapshotCanvas.height;
    this.activeMirrorId = mirrorId;
    this.mirrorState = "speaking";

    const rig = this.room.mirrors.get(mirrorId);
    if (rig) {
      const uniforms = rig.material.uniforms as MirrorShaderUniforms;
      uniforms.uSnapshotTex.value = snapTex;
      uniforms.uMouthCenter.value.set(mouthCenter.x, mouthCenter.y);
      uniforms.uMediaAspect.value = this.mediaAspect;
      uniforms.uFlash.value = 0.95;
      uniforms.uMode.value = 2.0;
    }
  }

  public setMirrorState(
    mirrorId: MirrorId | null,
    state: MirrorActivityState
  ): void {
    this.activeMirrorId = mirrorId;
    this.mirrorState = state;
    if (state === "idle") {
      this.clearMediaTextures();
    }
    this.syncMirrorUniforms();
  }

  private clearMediaTextures() {
    if (this.faceTexture) {
      this.faceTexture.dispose();
      this.faceTexture = null;
    }
    if (this.snapshotTexture) {
      this.snapshotTexture.dispose();
      this.snapshotTexture = null;
    }
    this.faceGenerator = null;
  }

  private syncMirrorUniforms() {
    for (const [id, rig] of this.room.mirrors.entries()) {
      const uniforms = rig.material.uniforms as MirrorShaderUniforms;
      if (id === this.activeMirrorId && this.mirrorState !== "idle") {
        uniforms.uMediaAspect.value = this.mediaAspect;
        if (this.faceTexture) {
          uniforms.uWebcamTex.value = this.faceTexture;
        }
        if (this.snapshotTexture) {
          uniforms.uSnapshotTex.value = this.snapshotTexture;
        }
        if (
          this.mirrorState === "face_ready" ||
          this.mirrorState === "generating"
        ) {
          uniforms.uMode.value = 1.0;
        } else {
          uniforms.uMode.value = 2.0;
        }
      } else {
        uniforms.uMode.value = 0.0;
      }
    }
  }

  private updateNavigation(delta: number, elapsed: number) {
    if (this.targetWalkPos) {
      this.playerPos.x = THREE.MathUtils.damp(
        this.playerPos.x,
        this.targetWalkPos.x,
        4.2,
        delta
      );
      this.playerPos.z = THREE.MathUtils.damp(
        this.playerPos.z,
        this.targetWalkPos.z,
        4.2,
        delta
      );
      if (
        Math.hypot(
          this.playerPos.x - this.targetWalkPos.x,
          this.playerPos.z - this.targetWalkPos.z
        ) < 0.04
      ) {
        this.targetWalkPos = null;
      }
    }

    if (this.targetYaw !== null) {
      let diff = ((this.targetYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * (1 - Math.exp(-5.0 * delta));
      if (Math.abs(diff) < 0.01) {
        this.targetYaw = null;
      }
    }

    if (this.targetPitch !== null) {
      this.pitch = THREE.MathUtils.damp(this.pitch, this.targetPitch, 5.0, delta);
      if (Math.abs(this.pitch - this.targetPitch) < 0.008) {
        this.targetPitch = null;
      }
    }

    const moveForward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const moveStrafe =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);

    let isWalking = false;
    if (moveForward !== 0 || moveStrafe !== 0) {
      isWalking = true;
      _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
      _move
        .set(0, 0, 0)
        .addScaledVector(_forward, moveForward)
        .addScaledVector(_right, moveStrafe)
        .normalize();

      const speed = 3.4;
      this.playerPos.addScaledVector(_move, speed * delta);
    }

    this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -5.45, 5.45);
    this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, -5.45, 5.45);

    const distCenter = Math.hypot(this.playerPos.x, this.playerPos.z);
    if (distCenter < 1.32 && distCenter > 0.001) {
      const push = 1.32 / distCenter;
      this.playerPos.x *= push;
      this.playerPos.z *= push;
    }

    const bob = isWalking ? Math.sin(elapsed * 9.5) * 0.025 : 0;
    this.camera.position.set(this.playerPos.x, 1.65 + bob, this.playerPos.z);
    _euler.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(_euler);
  }

  private emitProximity(force = false) {
    let bestRig: BuiltMirrorRig | null = null;
    let bestDist = Infinity;
    let bestFacing = 0;

    _camLookDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    for (const rig of this.room.mirrors.values()) {
      const mx = rig.config.position[0];
      const mz = rig.config.position[2];
      const dist = Math.hypot(this.playerPos.x - mx, this.playerPos.z - mz);
      _toMirror
        .set(mx - this.playerPos.x, 0, mz - this.playerPos.z)
        .normalize();
      const facing = _camLookDir.x * _toMirror.x + _camLookDir.z * _toMirror.z;

      if (dist < bestDist) {
        bestDist = dist;
        bestRig = rig;
        bestFacing = facing;
      }
    }

    if (!bestRig) return;

    const inRange = bestDist <= 3.65;
    const now = performance.now();
    const changed =
      force ||
      this.lastReportedMirrorId !== bestRig.config.id ||
      this.lastReportedInRange !== inRange ||
      now - this.lastDistanceReportTime > 220;

    if (changed) {
      this.lastReportedMirrorId = bestRig.config.id;
      this.lastReportedInRange = inRange;
      this.lastDistanceReportTime = now;
      this.callbacks.onProximityChange({
        nearestMirror: bestRig.config,
        distance: bestDist,
        inRange,
        facingScore: bestFacing,
      });
    }
  }

  private updateMirrors(delta: number, elapsed: number) {
    const bands = this.callbacks.getAudioBands();

    if (
      this.faceGenerator &&
      this.faceTexture &&
      (this.mirrorState === "face_ready" || this.mirrorState === "generating")
    ) {
      this.faceGenerator.draw(elapsed);
      this.faceTexture.needsUpdate = true;
    }

    let closestIdleId: MirrorId | null = null;
    let closestIdleDist = Infinity;

    for (const [id, rig] of this.room.mirrors.entries()) {
      const uniforms = rig.material.uniforms as MirrorShaderUniforms;
      uniforms.uTime.value = elapsed;

      const dist = Math.hypot(
        this.playerPos.x - rig.config.position[0],
        this.playerPos.z - rig.config.position[2]
      );
      const prox = THREE.MathUtils.clamp(1.0 - (dist - 1.8) / 3.2, 0, 1);
      uniforms.uProximity.value = THREE.MathUtils.damp(
        uniforms.uProximity.value,
        prox,
        5.0,
        delta
      );

      if (uniforms.uFlash.value > 0.001) {
        uniforms.uFlash.value = THREE.MathUtils.damp(
          uniforms.uFlash.value,
          0,
          7.5,
          delta
        );
      }

      const isActive = id === this.activeMirrorId && this.mirrorState !== "idle";
      const targetBlend = isActive ? 1.0 : 0.0;
      uniforms.uBlend.value = THREE.MathUtils.damp(
        uniforms.uBlend.value,
        targetBlend,
        4.5,
        delta
      );

      const speakingActive =
        id === this.activeMirrorId && this.mirrorState === "speaking";
      uniforms.uSpeechLevel.value = THREE.MathUtils.damp(
        uniforms.uSpeechLevel.value,
        speakingActive ? bands.level : 0,
        16.0,
        delta
      );
      uniforms.uSpeechLow.value = THREE.MathUtils.damp(
        uniforms.uSpeechLow.value,
        speakingActive ? bands.low : 0,
        12.0,
        delta
      );
      uniforms.uSpeechHigh.value = THREE.MathUtils.damp(
        uniforms.uSpeechHigh.value,
        speakingActive ? bands.high : 0,
        16.0,
        delta
      );

      const auraMat = rig.auraRing.material as THREE.MeshBasicMaterial;
      const targetAura = isActive
        ? 0.42 + bands.level * 0.35
        : prox * 0.25;
      auraMat.opacity = THREE.MathUtils.damp(auraMat.opacity, targetAura, 5.0, delta);

      rig.sconceGlow.emissiveIntensity =
        1.35 + (speakingActive ? bands.level * 0.8 : prox * 0.3);

      uniforms.uFogColor.value.copy(this.fog.color);
      uniforms.uFogDensity.value = this.fog.density;

      if (!isActive && uniforms.uBlend.value < 0.08 && dist < closestIdleDist) {
        closestIdleDist = dist;
        closestIdleId = id;
      }
    }

    // Subtle abyssal depth-fog breathing: slightly denser during storytelling for intimate focus
    const targetFogDensity =
      this.mirrorState === "speaking"
        ? 0.088 + bands.low * 0.008
        : 0.072 + Math.sin(elapsed * 0.35) * 0.004;
    this.fog.density = THREE.MathUtils.damp(
      this.fog.density,
      targetFogDensity,
      2.5,
      delta
    );

    for (const [id, rig] of this.room.mirrors.entries()) {
      if (rig.reflector) {
        rig.reflector.visible =
          !this.isSoftwareGl && id === closestIdleId && closestIdleDist < 7.2;
      }
    }
  }

  private tick = () => {
    if (this.disposed) return;

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();

    this.updateNavigation(delta, elapsed);
    this.emitProximity();
    this.updateMirrors(delta, elapsed);

    const pivot = this.room.whaleSculpture.userData.sculpturePivot as
      | THREE.Group
      | undefined;
    if (pivot) {
      pivot.rotation.y = elapsed * 0.16;
    }

    const snowUniforms = this.room.marineSnowMaterial.uniforms;
    snowUniforms.uTime.value = elapsed;
    const bands = this.callbacks.getAudioBands();
    snowUniforms.uSpeechEnergy.value = THREE.MathUtils.damp(
      snowUniforms.uSpeechEnergy.value,
      this.mirrorState === "speaking" ? bands.level : 0,
      4.5,
      delta
    );

    updateBioluminescentJellyfish(
      this.room.jellyfish,
      elapsed,
      snowUniforms.uSpeechEnergy.value
    );

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("webglcontextlost", this.onContextLost);
    canvas.removeEventListener("webglcontextrestored", this.onContextRestored);

    this.clearMediaTextures();
    this.room.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
