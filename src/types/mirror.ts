export type MirrorId = "porthole" | "arch" | "octagon" | "oval";

export type MirrorFrameStyle = "brass" | "walnut" | "steel" | "pearl";

export type MusicTrackId = "off" | "abyssal" | "tearoom" | "harp" | "trench";

export interface MusicTrackOption {
  id: MusicTrackId;
  label: string;
  mood: string;
}

export const MUSIC_TRACKS: MusicTrackOption[] = [
  { id: "abyssal", label: "Abyssal Drone", mood: "Deep whale sub-bass" },
  { id: "tearoom", label: "British Tea Room", mood: "Rainy lo-fi chords" },
  { id: "harp", label: "Bioluminescent Harp", mood: "Shimmering plucks" },
  { id: "trench", label: "Mariana Synth", mood: "Brooding abyssal pulse" },
  { id: "off", label: "Silent", mood: "No music" },
];

export interface MirrorConfig {
  id: MirrorId;
  name: string;
  wallLabel: string;
  subtitle: string;
  frameStyle: MirrorFrameStyle;
  shape: "circle" | "arch" | "octagon" | "oval";
  position: [number, number, number];
  rotationY: number;
  glassSize: [number, number];
  viewPoint: [number, number, number];
  viewYaw: number;
  accentHex: string;
  voiceName: "Charon" | "Kore" | "Fenrir" | "Zephyr" | "Puck";
  voiceStyle: string;
  oceanTheme: string;
}

export const ROOM_MIRRORS: MirrorConfig[] = [
  {
    id: "porthole",
    name: "Abyssal Brass Porthole",
    wallLabel: "North Wall",
    subtitle: "Sperm Whales & The Midnight Zone",
    frameStyle: "brass",
    shape: "circle",
    position: [0, 1.72, -6.28],
    rotationY: 0,
    glassSize: [1.56, 1.56],
    viewPoint: [0, 1.65, -4.15],
    viewYaw: 0,
    accentHex: "#38bdf8",
    voiceName: "Charon",
    voiceStyle:
      "Dry, deadpan, slightly awkward British narrator speaking with quiet oceanic solemnity and polite embarrassment",
    oceanTheme:
      "sperm whales plunging two thousand meters into the bathypelagic midnight zone and bioluminescent squid",
  },
  {
    id: "arch",
    name: "Pelagic Walnut Arch",
    wallLabel: "East Wall",
    subtitle: "Blue Whales & Basin-Wide Song",
    frameStyle: "walnut",
    shape: "arch",
    position: [6.28, 1.78, 0],
    rotationY: -Math.PI / 2,
    glassSize: [1.38, 2.04],
    viewPoint: [4.15, 1.65, 0],
    viewYaw: -Math.PI / 2,
    accentHex: "#2dd4bf",
    voiceName: "Kore",
    voiceStyle:
      "Polite, slightly flustered British storyteller balancing genuine marine wonder with terribly awkward small talk",
    oceanTheme:
      "blue whales singing low-frequency notes across entire ocean basins and drifting pelagic plankton clouds",
  },
  {
    id: "octagon",
    name: "Trench Steel Octagon",
    wallLabel: "West Wall",
    subtitle: "Hydrothermal Vents & Whale Falls",
    frameStyle: "steel",
    shape: "octagon",
    position: [-6.28, 1.72, 0],
    rotationY: Math.PI / 2,
    glassSize: [1.54, 1.54],
    viewPoint: [-4.15, 1.65, 0],
    viewYaw: Math.PI / 2,
    accentHex: "#60a5fa",
    voiceName: "Fenrir",
    voiceStyle:
      "Gravely, understated British eccentric narrating deep-sea disasters with stiff upper lip and awkward asides",
    oceanTheme:
      "hydrothermal black smokers, abyssal trenches, and a fallen whale sustaining deep-sea ecosystems for a century",
  },
  {
    id: "oval",
    name: "Driftwood Pearl Oval",
    wallLabel: "South Wall",
    subtitle: "Bowhead Whales & Polar Currents",
    frameStyle: "pearl",
    shape: "oval",
    position: [0, 1.75, 6.28],
    rotationY: Math.PI,
    glassSize: [1.34, 1.88],
    viewPoint: [0, 1.65, 4.15],
    viewYaw: Math.PI,
    accentHex: "#818cf8",
    voiceName: "Zephyr",
    voiceStyle:
      "Crisp, mildly self-conscious British storyteller mixing icy polar facts with overly apologetic social commentary",
    oceanTheme:
      "two-hundred-year-old bowhead whales beneath Arctic sea ice, humpback choruses, and twilight siphonophores",
  },
];

export type MirrorActivityState =
  | "idle"
  | "face_ready"
  | "generating"
  | "speaking"
  | "paused";

export interface GeneratedFaceInfo {
  personaName: string;
  traitLabel: string;
  mouthCenter: { x: number; y: number };
}

export interface ProximitySnapshot {
  nearestMirror: MirrorConfig;
  distance: number;
  inRange: boolean;
  facingScore: number;
}

export interface GeneratedStory {
  title: string;
  mouthCenter: { x: number; y: number };
  chapters: string[];
}
