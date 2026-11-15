import * as THREE from "three";
import { GeneratedFaceInfo } from "../types/mirror";

export function createWoodFloorTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext("2d")!;

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext("2d")!;

  cCtx.fillStyle = "#2b1e16";
  cCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = "#989898";
  rCtx.fillRect(0, 0, size, size);

  const planks = 8;
  const plankW = size / planks;

  for (let i = 0; i < planks; i++) {
    const x = i * plankW;
    const toneShift = ((i * 37) % 18) - 9;
    const r = Math.max(24, Math.min(72, 46 + toneShift));
    const g = Math.max(16, Math.min(54, 32 + Math.round(toneShift * 0.7)));
    const b = Math.max(12, Math.min(42, 23 + Math.round(toneShift * 0.5)));

    cCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    cCtx.fillRect(x + 1, 0, plankW - 2, size);

    // Subtle wood grain streaks
    for (let s = 0; s < 26; s++) {
      const gx = x + 3 + ((s * 17 + i * 11) % (plankW - 6));
      cCtx.fillStyle =
        s % 2 === 0 ? "rgba(18, 11, 7, 0.22)" : "rgba(92, 66, 46, 0.14)";
      cCtx.fillRect(gx, 0, 1.5, size);
    }

    // Horizontal plank joint
    const jointY = ((i * 173 + 80) % (size - 60)) + 30;
    cCtx.fillStyle = "#160f0b";
    cCtx.fillRect(x, jointY, plankW, 2);

    // Roughness variation per plank
    const rv = 115 + ((i * 29) % 45);
    rCtx.fillStyle = `rgb(${rv}, ${rv}, ${rv})`;
    rCtx.fillRect(x + 2, 0, plankW - 4, size);
    rCtx.fillStyle = "#e0e0e0";
    rCtx.fillRect(x, 0, 2, size);
    rCtx.fillRect(x, jointY, plankW, 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 5);
  map.anisotropy = maxAniso;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(5, 5);
  roughnessMap.anisotropy = maxAniso;

  return { map, roughnessMap };
}

export function createWallPlasterTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#1c2430");
  grad.addColorStop(0.55, "#232c3a");
  grad.addColorStop(1, "#161d28");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle Venetian plaster texture mottling
  for (let i = 0; i < 420; i++) {
    const x = (i * 97) % size;
    const y = (i * 53) % size;
    const w = 18 + (i % 34);
    const h = 10 + (i % 24);
    ctx.fillStyle =
      i % 2 === 0 ? "rgba(255,255,255,0.014)" : "rgba(6,10,18,0.025)";
    ctx.fillRect(x, y, w, h);
  }

  // Subtle architectural panel molding lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 34, size - 48, size - 88);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = maxAniso;
  return tex;
}

export function createRugTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#16202e";
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  const radial = ctx.createRadialGradient(cx, cy, 20, cx, cy, size * 0.5);
  radial.addColorStop(0, "#1e2e42");
  radial.addColorStop(0.75, "#152130");
  radial.addColorStop(1, "#0f1723");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);

  // Bathymetric contour rings woven into the rug
  for (let r = 42; r < size * 0.48; r += 26) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle =
      r > 205 ? "rgba(186, 160, 110, 0.28)" : "rgba(125, 180, 215, 0.14)";
    ctx.lineWidth = r > 205 ? 3 : 1.5;
    ctx.stroke();
  }

  // Subtle woven fiber grain
  for (let y = 0; y < size; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.03)";
    ctx.fillRect(0, y, size, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createPlaqueTexture(
  title: string,
  subtitle: string,
  maxAniso: number
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 512, 128);
  grad.addColorStop(0, "#463722");
  grad.addColorStop(0.5, "#6b5433");
  grad.addColorStop(1, "#3b2e1c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 128);

  ctx.strokeStyle = "#b8965c";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 112);

  ctx.fillStyle = "#f4e6cc";
  ctx.textAlign = "center";
  ctx.font = "600 28px Georgia, serif";
  ctx.fillText(title, 256, 56);

  ctx.fillStyle = "#d5c098";
  ctx.font = "400 18px sans-serif";
  ctx.fillText(subtitle, 256, 92);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

interface FaceSpec {
  personaName: string;
  traitLabel: string;
  bgTop: string;
  bgBottom: string;
  glowColor: string;
  skinLight: string;
  skinMid: string;
  skinShadow: string;
  hairColor: string;
  eyeColor: string;
  headWidth: number;
  headHeight: number;
  jawWidth: number;
  hairStyle: "parted" | "bob" | "swept" | "curly" | "fringe";
  beardStyle: "none" | "handlebar" | "walrus" | "goatee";
  eyewear: "none" | "monocle" | "round_specs" | "half_moon";
  outfit: "tweed_cravat" | "turtleneck" | "peacoat" | "waistcoat";
  browMood: "quizzical" | "nervous" | "stern" | "polite";
  blush: boolean;
  freckles: boolean;
  mouthWidth: number;
  mouthOffsetY: number;
}

const FIRST_NAMES = [
  "Barnaby",
  "Nigel",
  "Beatrice",
  "Reginald",
  "Gwendolyn",
  "Cecil",
  "Agatha",
  "Humphrey",
  "Phillipa",
  "Algernon",
  "Harriet",
  "Montague",
];

const SKIN_TONES = [
  { light: "#f1d3c2", mid: "#d7ae98", shadow: "#a47a67" },
  { light: "#e7c0a3", mid: "#c79778", shadow: "#8c6149" },
  { light: "#d19b78", mid: "#ae7756", shadow: "#744932" },
  { light: "#9b674b", mid: "#794b34", shadow: "#4c2c1d" },
  { light: "#f4d7d0", mid: "#dbb1a6", shadow: "#a57a72" },
];

const HAIR_COLORS = [
  "#1c1b20",
  "#4a2f22",
  "#7b4b2a",
  "#9e8f81",
  "#c6b89e",
  "#8a3b24",
  "#2e3440",
];

const EYE_COLORS = ["#274c6b", "#3a5a40", "#5c3d28", "#4f6272", "#2e4756"];

const BACKDROPS = [
  { top: "#111b29", bottom: "#0a1019", glow: "rgba(56, 189, 248, 0.25)" },
  { top: "#15232b", bottom: "#0b141a", glow: "rgba(45, 212, 191, 0.22)" },
  { top: "#1c1f33", bottom: "#0c0f1d", glow: "rgba(129, 140, 248, 0.24)" },
  { top: "#1e242b", bottom: "#0d1117", glow: "rgba(148, 163, 184, 0.22)" },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Procedural face generator that creates a fresh, expressive character portrait
 * every time a mirror is found or regenerated, with exact mouth coordinates
 * for real-time speaking lip-sync in the 3D mirror shader.
 */
export class ProceduralFaceGenerator {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private spec!: FaceSpec;

  constructor(width = 640, height = 480) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;
    this.randomize();
  }

  public randomize(): GeneratedFaceInfo {
    const skin = pick(SKIN_TONES);
    const backdrop = pick(BACKDROPS);
    const hairStyle = pick<FaceSpec["hairStyle"]>([
      "parted",
      "bob",
      "swept",
      "curly",
      "fringe",
    ]);
    const beardStyle = pick<FaceSpec["beardStyle"]>([
      "none",
      "none",
      "handlebar",
      "walrus",
      "goatee",
    ]);
    const eyewear = pick<FaceSpec["eyewear"]>([
      "none",
      "monocle",
      "round_specs",
      "half_moon",
    ]);
    const outfit = pick<FaceSpec["outfit"]>([
      "tweed_cravat",
      "turtleneck",
      "peacoat",
      "waistcoat",
    ]);
    const browMood = pick<FaceSpec["browMood"]>([
      "quizzical",
      "nervous",
      "stern",
      "polite",
    ]);
    const personaName = pick(FIRST_NAMES);

    const traitParts: string[] = [];
    if (eyewear === "monocle") traitParts.push("Brass Monocle");
    else if (eyewear === "round_specs") traitParts.push("Round Spectacles");
    else if (eyewear === "half_moon") traitParts.push("Reading Glasses");

    if (beardStyle === "handlebar") traitParts.push("Handlebar Moustache");
    else if (beardStyle === "walrus") traitParts.push("Walrus Moustache");
    else if (beardStyle === "goatee") traitParts.push("Pointed Goatee");

    if (outfit === "tweed_cravat") traitParts.push("Damp Cravat");
    else if (outfit === "turtleneck") traitParts.push("Sea Turtleneck");
    else if (outfit === "peacoat") traitParts.push("Harbour Peacoat");
    else traitParts.push("Velvet Waistcoat");

    const mouthOffsetY = 44 + Math.random() * 10;

    this.spec = {
      personaName,
      traitLabel: traitParts.slice(0, 2).join(" & "),
      bgTop: backdrop.top,
      bgBottom: backdrop.bottom,
      glowColor: backdrop.glow,
      skinLight: skin.light,
      skinMid: skin.mid,
      skinShadow: skin.shadow,
      hairColor: pick(HAIR_COLORS),
      eyeColor: pick(EYE_COLORS),
      headWidth: 68 + Math.random() * 16,
      headHeight: 88 + Math.random() * 16,
      jawWidth: 0.78 + Math.random() * 0.24,
      hairStyle,
      beardStyle,
      eyewear,
      outfit,
      browMood,
      blush: Math.random() > 0.45,
      freckles: Math.random() > 0.6,
      mouthWidth: 18 + Math.random() * 10,
      mouthOffsetY,
    };

    this.draw(0);
    return this.getInfo();
  }

  public getInfo(): GeneratedFaceInfo {
    const h = this.canvas.height;
    const baseCy = h * 0.44;
    return {
      personaName: this.spec.personaName,
      traitLabel: this.spec.traitLabel,
      mouthCenter: {
        x: 0.5,
        y: (baseCy + this.spec.mouthOffsetY) / h,
      },
    };
  }

  public draw(timeSec: number) {
    const { width: w, height: h } = this.canvas;
    const ctx = this.ctx;
    const s = this.spec;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, s.bgTop);
    bg.addColorStop(1, s.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Soft oceanic studio rim glow behind portrait
    const glow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.42,
      20,
      w * 0.5,
      h * 0.45,
      w * 0.5
    );
    glow.addColorStop(0, s.glowColor);
    glow.addColorStop(1, "rgba(10, 15, 24, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const swayX = Math.sin(timeSec * 0.85) * 2.5;
    const breathY = Math.sin(timeSec * 1.45) * 2.0;
    const cx = w * 0.5 + swayX;
    const cy = h * 0.44 + breathY;

    // Back hair layer for bob / curly
    if (s.hairStyle === "bob" || s.hairStyle === "curly") {
      ctx.fillStyle = s.hairColor;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy + 10,
        s.headWidth + (s.hairStyle === "curly" ? 26 : 16),
        s.headHeight + 18,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Shoulders & outfit
    const coatColors: Record<FaceSpec["outfit"], string> = {
      tweed_cravat: "#3c342b",
      turtleneck: "#1c2d42",
      peacoat: "#192231",
      waistcoat: "#2e1f27",
    };
    ctx.fillStyle = coatColors[s.outfit];
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.96 + breathY * 0.5, w * 0.3, h * 0.3, 0, Math.PI, 0);
    ctx.fill();

    // Neck
    ctx.fillStyle = s.skinShadow;
    ctx.fillRect(cx - 24, cy + s.headHeight * 0.58, 48, 74);

    // Outfit collar accents
    if (s.outfit === "turtleneck") {
      ctx.fillStyle = "#263c57";
      ctx.beginPath();
      ctx.roundRect(cx - 34, cy + s.headHeight * 0.84, 68, 36, 10);
      ctx.fill();
    } else if (s.outfit === "tweed_cravat") {
      ctx.fillStyle = "#d9d2c5";
      ctx.beginPath();
      ctx.moveTo(cx - 42, cy + s.headHeight * 0.88);
      ctx.lineTo(cx, cy + s.headHeight * 1.15);
      ctx.lineTo(cx + 42, cy + s.headHeight * 0.88);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8a323b";
      ctx.beginPath();
      ctx.ellipse(cx, cy + s.headHeight * 1.02, 16, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(210, 220, 232, 0.28)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 48, cy + s.headHeight * 0.88);
      ctx.lineTo(cx, cy + s.headHeight * 1.18);
      ctx.lineTo(cx + 48, cy + s.headHeight * 0.88);
      ctx.stroke();
    }

    // Ears
    for (const side of [-1, 1]) {
      ctx.fillStyle = s.skinMid;
      ctx.beginPath();
      ctx.ellipse(
        cx + side * (s.headWidth - 2),
        cy + 4,
        11,
        18,
        side * 0.12,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Head base with warm shading
    const skinGrad = ctx.createRadialGradient(
      cx - 18,
      cy - 24,
      14,
      cx,
      cy,
      s.headHeight * 1.15
    );
    skinGrad.addColorStop(0, s.skinLight);
    skinGrad.addColorStop(0.68, s.skinMid);
    skinGrad.addColorStop(1, s.skinShadow);
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s.headHeight);
    ctx.bezierCurveTo(
      cx + s.headWidth * 1.12,
      cy - s.headHeight,
      cx + s.headWidth * s.jawWidth * 1.15,
      cy + s.headHeight * 0.72,
      cx,
      cy + s.headHeight
    );
    ctx.bezierCurveTo(
      cx - s.headWidth * s.jawWidth * 1.15,
      cy + s.headHeight * 0.72,
      cx - s.headWidth * 1.12,
      cy - s.headHeight,
      cx,
      cy - s.headHeight
    );
    ctx.fill();

    // Optional rosy awkward blush
    if (s.blush) {
      for (const side of [-1, 1]) {
        const blushGrad = ctx.createRadialGradient(
          cx + side * 34,
          cy + 18,
          2,
          cx + side * 34,
          cy + 18,
          22
        );
        blushGrad.addColorStop(0, "rgba(215, 95, 95, 0.25)");
        blushGrad.addColorStop(1, "rgba(215, 95, 95, 0)");
        ctx.fillStyle = blushGrad;
        ctx.beginPath();
        ctx.arc(cx + side * 34, cy + 18, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Optional freckles
    if (s.freckles) {
      ctx.fillStyle = "rgba(110, 62, 42, 0.35)";
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx + i * 11, cy + 12 + (Math.abs(i) % 2) * 4, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Front Hair
    ctx.fillStyle = s.hairColor;
    if (s.hairStyle === "parted") {
      ctx.beginPath();
      ctx.ellipse(cx - 10, cy - s.headHeight * 0.62, s.headWidth * 0.85, 42, -0.18, Math.PI, Math.PI * 2.1);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 28, cy - s.headHeight * 0.56, s.headWidth * 0.55, 34, 0.25, Math.PI * 0.9, Math.PI * 2.0);
      ctx.fill();
    } else if (s.hairStyle === "swept") {
      ctx.beginPath();
      ctx.ellipse(cx, cy - s.headHeight * 0.55, s.headWidth * 1.04, 54, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (s.hairStyle === "fringe") {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + side * (s.headWidth * 0.82), cy - 22, 14, 34, side * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (s.hairStyle === "curly") {
      for (let a = -3; a <= 3; a++) {
        ctx.beginPath();
        ctx.arc(cx + a * 20, cy - s.headHeight * 0.72 + Math.abs(a) * 5, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy - s.headHeight * 0.58, s.headWidth * 1.05, 48, 0, Math.PI * 0.92, Math.PI * 2.08);
      ctx.fill();
    }

    // Eyes with natural blink
    const blinkCycle = timeSec % 4.1;
    const eyeOpen = blinkCycle > 3.92 ? 0.14 : 1.0;
    for (const side of [-1, 1]) {
      const ex = cx + side * 28;
      const ey = cy - 10;

      ctx.fillStyle = "#f2f5f8";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 12, 6.8 * eyeOpen, 0, 0, Math.PI * 2);
      ctx.fill();

      if (eyeOpen > 0.3) {
        ctx.fillStyle = s.eyeColor;
        ctx.beginPath();
        ctx.arc(ex, ey, 5.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#0e131b";
        ctx.beginPath();
        ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex - 1.7, ey - 1.7, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Expressive Eyebrows
      ctx.strokeStyle = s.hairColor;
      ctx.lineWidth = 3.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      let lift = 0;
      let tilt = 0;
      if (s.browMood === "quizzical" && side === 1) lift = -7;
      if (s.browMood === "nervous") tilt = side * 4;
      if (s.browMood === "stern") tilt = -side * 4;
      ctx.moveTo(ex - 14, ey - 15 + lift + tilt);
      ctx.quadraticCurveTo(ex, ey - 20 + lift, ex + 14, ey - 14 + lift - tilt);
      ctx.stroke();
    }

    // Eyewear
    if (s.eyewear === "round_specs") {
      ctx.strokeStyle = "#2b2520";
      ctx.lineWidth = 2.6;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + side * 28, cy - 10, 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 10);
      ctx.lineTo(cx + 10, cy - 10);
      ctx.stroke();
    } else if (s.eyewear === "half_moon") {
      ctx.strokeStyle = "#a88346";
      ctx.lineWidth = 2.4;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + side * 28, cy - 10, 16, 0, Math.PI);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 10);
      ctx.lineTo(cx + 12, cy - 10);
      ctx.stroke();
    } else if (s.eyewear === "monocle") {
      ctx.strokeStyle = "#d4af64";
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(cx + 28, cy - 10, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + 46, cy - 6);
      ctx.quadraticCurveTo(cx + 52, cy + 45, cx + 36, cy + 95);
      ctx.stroke();
    }

    // Nose
    ctx.strokeStyle = s.skinShadow;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 4, cy + 20);
    ctx.quadraticCurveTo(cx, cy + 24, cx + 6, cy + 21);
    ctx.stroke();

    // Mouth (centered exactly at mouthOffsetY)
    const mouthY = cy + s.mouthOffsetY;
    ctx.strokeStyle = "#6e3834";
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(cx - s.mouthWidth, mouthY);
    ctx.quadraticCurveTo(cx, mouthY + 3, cx + s.mouthWidth, mouthY - 1);
    ctx.stroke();

    // Facial hair
    if (s.beardStyle === "handlebar") {
      ctx.fillStyle = s.hairColor;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, mouthY - 9);
        ctx.quadraticCurveTo(cx + side * 22, mouthY - 13, cx + side * 36, mouthY - 2);
        ctx.quadraticCurveTo(cx + side * 26, mouthY + 2, cx, mouthY - 3);
        ctx.fill();
      }
    } else if (s.beardStyle === "walrus") {
      ctx.fillStyle = s.hairColor;
      ctx.beginPath();
      ctx.ellipse(cx, mouthY - 5, 34, 11, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (s.beardStyle === "goatee") {
      ctx.fillStyle = s.hairColor;
      ctx.beginPath();
      ctx.moveTo(cx - 16, mouthY + 12);
      ctx.lineTo(cx + 16, mouthY + 12);
      ctx.lineTo(cx, mouthY + 42);
      ctx.closePath();
      ctx.fill();
    }
  }
}

