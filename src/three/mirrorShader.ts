import * as THREE from "three";

export interface MirrorShaderUniforms {
  [uniform: string]: THREE.IUniform;
  uTime: { value: number };
  uMode: { value: number }; // 0 = idle glass, 1 = live webcam, 2 = speaking snapshot
  uBlend: { value: number }; // smooth 0..1 transition into active media
  uMirrorAspect: { value: number };
  uMediaAspect: { value: number };
  uWebcamTex: { value: THREE.Texture };
  uSnapshotTex: { value: THREE.Texture };
  uMouthCenter: { value: THREE.Vector2 };
  uSpeechLevel: { value: number };
  uSpeechLow: { value: number };
  uSpeechHigh: { value: number };
  uFlash: { value: number };
  uProximity: { value: number };
  uAccentColor: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uFogDensity: { value: number };
}

function createPlaceholderTexture(): THREE.DataTexture {
  const data = new Uint8Array([14, 22, 34, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createMirrorSurfaceMaterial(
  accentHex: string,
  mirrorAspect: number
): THREE.ShaderMaterial {
  const placeholder = createPlaceholderTexture();

  const uniforms: MirrorShaderUniforms = {
    uTime: { value: 0 },
    uMode: { value: 0 },
    uBlend: { value: 0 },
    uMirrorAspect: { value: mirrorAspect },
    uMediaAspect: { value: 4 / 3 },
    uWebcamTex: { value: placeholder },
    uSnapshotTex: { value: placeholder },
    uMouthCenter: { value: new THREE.Vector2(0.5, 0.58) },
    uSpeechLevel: { value: 0 },
    uSpeechLow: { value: 0 },
    uSpeechHigh: { value: 0 },
    uFlash: { value: 0 },
    uProximity: { value: 0 },
    uAccentColor: { value: new THREE.Color(accentHex) },
    uFogColor: { value: new THREE.Color(0x07111d) },
    uFogDensity: { value: 0.074 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vFogDepth;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uMode;
      uniform float uBlend;
      uniform float uMirrorAspect;
      uniform float uMediaAspect;
      uniform sampler2D uWebcamTex;
      uniform sampler2D uSnapshotTex;
      uniform vec2 uMouthCenter;
      uniform float uSpeechLevel;
      uniform float uSpeechLow;
      uniform float uSpeechHigh;
      uniform float uFlash;
      uniform float uProximity;
      uniform vec3 uAccentColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vFogDepth;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float causticPattern(vec2 uv, float t) {
        float c1 = sin(uv.x * 9.0 + t * 0.9 + noise(uv * 3.5 + t * 0.3) * 3.0);
        float c2 = cos(uv.y * 8.0 - t * 0.7 + noise(uv * 4.0 - t * 0.25) * 3.0);
        float ridge = 1.0 - abs(c1 + c2) * 0.5;
        return pow(clamp(ridge, 0.0, 1.0), 4.0);
      }

      vec2 computeCoverUv(vec2 uv, float mirrorAsp, float mediaAsp) {
        vec2 centered = uv - 0.5;
        if (mediaAsp > mirrorAsp) {
          centered.x *= mirrorAsp / max(mediaAsp, 0.001);
        } else {
          centered.y *= mediaAsp / max(mirrorAsp, 0.001);
        }
        return clamp(centered + 0.5, 0.001, 0.999);
      }

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

        // Idle oceanic silvered mirror surface
        float caustics = causticPattern(vUv * 1.4, uTime);
        vec3 deepGlass = mix(vec3(0.05, 0.09, 0.14), vec3(0.14, 0.22, 0.30), vUv.y);
        float diagonalSheen = smoothstep(0.15, 0.85, sin((vUv.x + vUv.y) * 3.2 + uTime * 0.25) * 0.5 + 0.5);
        vec3 idleColor = deepGlass
          + uAccentColor * caustics * (0.12 + uProximity * 0.16)
          + vec3(0.16, 0.21, 0.27) * diagonalSheen * 0.25
          + vec3(0.35, 0.48, 0.62) * fresnel * 0.45;

        // Subtle glass ripple wave when user approaches
        float rimDist = distance(vUv, vec2(0.5));
        float proximityGlow = smoothstep(0.34, 0.52, rimDist) * uProximity * 0.22;
        idleColor += uAccentColor * proximityGlow;

        vec3 activeColor = idleColor;

        if (uMode > 0.5 && uMode < 1.5) {
          // Live generated face feed
          vec2 coverUv = computeCoverUv(vUv, uMirrorAspect, uMediaAspect);
          vec3 cam = texture2D(uWebcamTex, coverUv).rgb;

          // Subtle mirror silvering & glass reflection overlay
          vec3 glassTint = mix(cam, cam * vec3(0.92, 0.98, 1.03), 0.32);
          glassTint += uAccentColor * caustics * 0.08;
          glassTint += vec3(0.28, 0.40, 0.55) * fresnel * 0.28;
          activeColor = glassTint;
        } else if (uMode >= 1.5) {
          // Speaking snapshot mode
          vec2 coverUv = computeCoverUv(vUv, uMirrorAspect, uMediaAspect);

          // Gentle breathing & head motion synced with speech low band
          float breath = sin(uTime * 1.8) * 0.003 + uSpeechLow * 0.005;
          vec2 animUv = coverUv + vec2(sin(uTime * 0.9) * 0.0025 * (0.3 + uSpeechLevel), breath);

          // Mouth UV in WebGL texture space (y=1 is top, y=0 is bottom)
          vec2 mouthUv = vec2(uMouthCenter.x, 1.0 - uMouthCenter.y);
          vec2 delta = animUv - mouthUv;

          // Elliptical region around the mouth & jaw
          vec2 normDelta = vec2(delta.x / 0.095, delta.y / 0.058);
          float mouthDist = length(normDelta);
          float regionMask = smoothstep(1.0, 0.0, mouthDist);

          // Natural syllable oscillation driven by real audio RMS + harmonic modulation
          float syllable = clamp(
            uSpeechLevel * (0.7 + 0.3 * sin(uTime * 18.0 + uSpeechHigh * 6.0)),
            0.0,
            1.0
          );

          // Pull lower lip/jaw down and slightly part upper lip
          float lowerLipSign = smoothstep(-0.35, 0.15, -normDelta.y);
          float upperLipLift = smoothstep(-0.2, 0.5, normDelta.y) * 0.35;
          float verticalOffset = (lowerLipSign - upperLipLift) * syllable * 0.022 * regionMask;
          vec2 sampleUv = clamp(animUv + vec2(0.0, verticalOffset), 0.001, 0.999);

          vec3 snap = texture2D(uSnapshotTex, sampleUv).rgb;

          // Oral cavity shadow when mouth opens
          float cavityMask = smoothstep(0.62, 0.05, length(vec2(delta.x / 0.052, delta.y / 0.024)));
          float cavityShadow = cavityMask * syllable * 0.58;
          snap *= (1.0 - cavityShadow);

          // Subtle deep-ocean bioluminescent atmosphere transforming the background
          float portraitMask = smoothstep(0.55, 0.22, distance(coverUv, vec2(uMouthCenter.x, 1.0 - uMouthCenter.y + 0.05)));
          float oceanRipple = sin(distance(vUv, mouthUv) * 28.0 - uTime * 3.2) * 0.5 + 0.5;
          float acousticWave = smoothstep(0.65, 1.0, oceanRipple) * uSpeechLevel * (1.0 - portraitMask * 0.65);

          vec3 deepTint = mix(snap, snap * vec3(0.76, 0.92, 1.08), 0.28 + 0.2 * (1.0 - portraitMask));
          deepTint += uAccentColor * (caustics * 0.14 + acousticWave * 0.22);
          deepTint += vec3(0.24, 0.42, 0.60) * fresnel * 0.32;

          activeColor = deepTint;
        }

        // Vignette inside the glass frame
        float vig = smoothstep(0.82, 0.34, distance(vUv, vec2(0.5)));
        vec3 finalColor = mix(idleColor, activeColor, uBlend);
        finalColor *= (0.78 + 0.22 * vig);

        // Camera shutter flash ripple
        finalColor += vec3(0.85, 0.95, 1.0) * uFlash;

        // Match scene THREE.FogExp2 exponential-squared depth attenuation
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        finalColor = mix(finalColor, uFogColor, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}
