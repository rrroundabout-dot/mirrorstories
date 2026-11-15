import { useCallback, useEffect, useRef, useState } from "react";
import { MirrorDock } from "./components/MirrorDock";
import { OceanicLoreModal } from "./components/OceanicLoreModal";
import { OceanStoryAudioEngine } from "./services/audioEngine";
import { MirrorGalleryEngine } from "./three/MirrorGalleryEngine";
import {
  GeneratedFaceInfo,
  GeneratedStory,
  MirrorActivityState,
  MirrorId,
  MusicTrackId,
  ProximitySnapshot,
  ROOM_MIRRORS,
} from "./types/mirror";

const DISCOVERED_STORAGE_KEY = "oceanic-mirrors:discovered-v1";
const LORE_SEEN_STORAGE_KEY = "oceanic-mirrors:lore-seen-v1";
const VALID_MIRROR_IDS = new Set<MirrorId>(ROOM_MIRRORS.map((m) => m.id));

function loadDiscoveredMirrors(): MirrorId[] {
  try {
    const raw = window.localStorage.getItem(DISCOVERED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique: MirrorId[] = [];
    for (const item of parsed) {
      if (
        typeof item === "string" &&
        VALID_MIRROR_IDS.has(item as MirrorId) &&
        !unique.includes(item as MirrorId)
      ) {
        unique.push(item as MirrorId);
      }
    }
    return unique;
  } catch {
    return [];
  }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MirrorGalleryEngine | null>(null);
  const audioRef = useRef<OceanStoryAudioEngine | null>(null);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const [proximity, setProximity] = useState<ProximitySnapshot>({
    nearestMirror: ROOM_MIRRORS[0],
    distance: 4.5,
    inRange: false,
    facingScore: 1,
  });

  const [activeMirrorId, setActiveMirrorId] = useState<MirrorId | null>(null);
  const [mirrorState, setMirrorState] = useState<MirrorActivityState>("idle");
  const [faceInfo, setFaceInfo] = useState<GeneratedFaceInfo | null>(null);
  const [discoveredMirrors, setDiscoveredMirrors] = useState<MirrorId[]>(
    loadDiscoveredMirrors
  );
  const [loreOpen, setLoreOpen] = useState(false);
  const [loreSeen, setLoreSeen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(LORE_SEEN_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [musicTrack, setMusicTrack] = useState<MusicTrackId>("abyssal");
  const [musicStarted, setMusicStarted] = useState(false);

  const [apiError, setApiError] = useState<string | null>(null);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState<string | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [chapterText, setChapterText] = useState("");

  const mirrorStateRef = useRef<MirrorActivityState>("idle");
  const activeMirrorIdRef = useRef<MirrorId | null>(null);
  const musicTrackRef = useRef<MusicTrackId>("abyssal");
  const musicStartedRef = useRef(false);

  mirrorStateRef.current = mirrorState;
  activeMirrorIdRef.current = activeMirrorId;
  musicTrackRef.current = musicTrack;
  musicStartedRef.current = musicStarted;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        DISCOVERED_STORAGE_KEY,
        JSON.stringify(discoveredMirrors)
      );
    } catch {
      // Ignore storage quota or private-mode errors
    }

    if (discoveredMirrors.length === ROOM_MIRRORS.length && !loreSeen) {
      setLoreSeen(true);
      setLoreOpen(true);
      try {
        window.localStorage.setItem(LORE_SEEN_STORAGE_KEY, "1");
      } catch {
        // Ignore
      }
    }
  }, [discoveredMirrors, loreSeen]);

  const markMirrorDiscovered = useCallback((id: MirrorId) => {
    setDiscoveredMirrors((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const handleResetCollection = useCallback(() => {
    setDiscoveredMirrors([]);
    setLoreSeen(false);
    setLoreOpen(false);
    try {
      window.localStorage.removeItem(LORE_SEEN_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const unlockMusicOnGesture = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.unlock();
    if (!musicStartedRef.current) {
      musicStartedRef.current = true;
      setMusicStarted(true);
      audioRef.current.setMusicTrack(musicTrackRef.current);
    }
  }, []);

  const handleStopAll = useCallback(() => {
    audioRef.current?.stopStoryOnly();
    engineRef.current?.setMirrorState(null, "idle");
    setActiveMirrorId(null);
    setMirrorState("idle");
    setFaceInfo(null);
    setStoryTitle(null);
    setChapterIndex(0);
    setTotalChapters(0);
    setChapterText("");
    setTtsNotice(null);
  }, []);

  // Initialize Three.js engine & Web Audio engine once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new OceanStoryAudioEngine();
    audioRef.current = audio;

    let wasInRange = false;
    let lastInRangeMirrorId: MirrorId | null = null;

    const engine = new MirrorGalleryEngine(container, {
      onProximityChange: (snap) => {
        setProximity(snap);

        // Trigger delicate glass chime when entering a mirror's proximity
        if (
          snap.inRange &&
          (!wasInRange || lastInRangeMirrorId !== snap.nearestMirror.id)
        ) {
          audio.playMirrorChime(snap.nearestMirror.id);
        }
        wasInRange = snap.inRange;
        lastInRangeMirrorId = snap.inRange ? snap.nearestMirror.id : null;

        // Scale subtle continuous underwater hum with closeness to the mirror
        const intensity = snap.inRange
          ? Math.max(0.2, Math.min(1, 1 - (snap.distance - 1.8) / 2.1))
          : 0;
        audio.setMirrorProximity(snap.inRange, snap.nearestMirror.id, intensity);

        const curState = mirrorStateRef.current;
        const curMirror = activeMirrorIdRef.current;

        // When a mirror is found (entering proximity), mark discovered & awaken Face Generator
        if (snap.inRange) {
          markMirrorDiscovered(snap.nearestMirror.id);
        }

        if (snap.inRange && curState === "idle") {
          const info = engine.activateFaceGenerator(snap.nearestMirror.id);
          setActiveMirrorId(snap.nearestMirror.id);
          setMirrorState("face_ready");
          setFaceInfo(info);
        } else if (
          snap.inRange &&
          curState === "face_ready" &&
          curMirror !== snap.nearestMirror.id
        ) {
          // Switching directly to a newly found mirror generates a fresh face
          const info = engine.activateFaceGenerator(snap.nearestMirror.id);
          setActiveMirrorId(snap.nearestMirror.id);
          setFaceInfo(info);
        } else if (!snap.inRange && curState === "face_ready") {
          // Stepping away returns the mirror to dormant glass
          engine.setMirrorState(null, "idle");
          setActiveMirrorId(null);
          setMirrorState("idle");
          setFaceInfo(null);
        }
      },
      onMirrorClick: (mirrorId) => {
        unlockMusicOnGesture();
        markMirrorDiscovered(mirrorId);
      },
      onContextLost: (lost) => setContextLost(lost),
      getAudioBands: () => audio.getAudioBands(),
    });
    engineRef.current = engine;

    const onKey = (e: KeyboardEvent) => {
      unlockMusicOnGesture();
      if (
        e.key.toLowerCase() === "h" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      audio.dispose();
      engine.dispose();
      audioRef.current = null;
      engineRef.current = null;
    };
  }, [markMirrorDiscovered, unlockMusicOnGesture]);

  const handleFocusMirror = useCallback(
    (id: MirrorId) => {
      unlockMusicOnGesture();
      markMirrorDiscovered(id);
      if (mirrorState === "speaking" || mirrorState === "paused") {
        audioRef.current?.stopStoryOnly();
        setStoryTitle(null);
        setChapterIndex(0);
        setTotalChapters(0);
        setChapterText("");
      }
      engineRef.current?.focusMirror(id);
      const info = engineRef.current?.activateFaceGenerator(id);
      if (info) {
        setActiveMirrorId(id);
        setMirrorState("face_ready");
        setFaceInfo(info);
      }
    },
    [markMirrorDiscovered, mirrorState, unlockMusicOnGesture]
  );

  const handleGenerateFace = useCallback(() => {
    unlockMusicOnGesture();
    setApiError(null);
    const targetId = activeMirrorId || proximity.nearestMirror.id;
    markMirrorDiscovered(targetId);
    const info =
      mirrorState === "face_ready"
        ? engineRef.current?.regenerateFace(targetId)
        : engineRef.current?.activateFaceGenerator(targetId);

    if (info) {
      setActiveMirrorId(targetId);
      setMirrorState("face_ready");
      setFaceInfo(info);
    }
  }, [
    activeMirrorId,
    markMirrorDiscovered,
    mirrorState,
    proximity.nearestMirror.id,
    unlockMusicOnGesture,
  ]);

  const handleChangeMusic = useCallback((trackId: MusicTrackId) => {
    musicStartedRef.current = true;
    setMusicStarted(true);
    setMusicTrack(trackId);
    audioRef.current?.setMusicTrack(trackId);
  }, []);

  const captureFaceSnapshot = useCallback((): HTMLCanvasElement | null => {
    const faceCanvas = engineRef.current?.getFaceCanvas();
    if (!faceCanvas) return null;

    const out = document.createElement("canvas");
    out.width = faceCanvas.width;
    out.height = faceCanvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(faceCanvas, 0, 0);
    return out;
  }, []);

  const handleListen = useCallback(async () => {
    unlockMusicOnGesture();
    const mirrorId = activeMirrorId || proximity.nearestMirror.id;
    const mirrorCfg =
      ROOM_MIRRORS.find((m) => m.id === mirrorId) || proximity.nearestMirror;

    const snapshotCanvas = captureFaceSnapshot();
    if (!snapshotCanvas) {
      setApiError("Unable to capture snapshot from the face generator.");
      return;
    }

    setApiError(null);
    setTtsNotice(null);
    setMirrorState("generating");
    engineRef.current?.setMirrorState(mirrorCfg.id, "generating");
    engineRef.current?.focusMirror(mirrorCfg.id);

    const dataUrl = snapshotCanvas.toDataURL("image/jpeg", 0.86);

    try {
      const res = await fetch("/api/whale-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: "image/jpeg",
          mirrorName: mirrorCfg.name,
          mirrorTheme: mirrorCfg.oceanTheme,
          facePersona: faceInfo?.personaName,
          faceTraits: faceInfo?.traitLabel,
        }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errBody.error || `Story generation failed (${res.status})`);
      }

      const story = (await res.json()) as GeneratedStory;
      const mouthCoords = faceInfo?.mouthCenter || story.mouthCenter;

      engineRef.current?.setSpeakingSnapshot(
        mirrorCfg.id,
        snapshotCanvas,
        mouthCoords
      );

      setStoryTitle(story.title);
      setTotalChapters(story.chapters.length);
      setChapterIndex(0);
      setChapterText(story.chapters[0] || "");
      setMirrorState("speaking");

      await audioRef.current?.startStory(
        story.chapters,
        mirrorCfg.voiceName,
        mirrorCfg.voiceStyle,
        {
          onChapterStart: (idx, text) => {
            setChapterIndex(idx);
            setChapterText(text);
          },
          onPlaybackComplete: () => {
            engineRef.current?.setMirrorState(mirrorCfg.id, "face_ready");
            setMirrorState("face_ready");
            setStoryTitle(null);
            setChapterText("");
            setTtsNotice(null);
          },
          onNotice: (msg) => {
            setTtsNotice(msg);
          },
          onError: (msg) => {
            setApiError(msg);
            engineRef.current?.setMirrorState(mirrorCfg.id, "face_ready");
            setMirrorState("face_ready");
          },
        }
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to start speaking mirror.";
      setApiError(msg);
      setMirrorState("face_ready");
      engineRef.current?.setMirrorState(mirrorCfg.id, "face_ready");
    }
  }, [
    activeMirrorId,
    captureFaceSnapshot,
    faceInfo,
    proximity.nearestMirror,
    unlockMusicOnGesture,
  ]);

  const handlePauseResume = useCallback(async () => {
    if (!audioRef.current) return;
    if (mirrorState === "speaking") {
      await audioRef.current.pause();
      setMirrorState("paused");
      if (activeMirrorId) {
        engineRef.current?.setMirrorState(activeMirrorId, "paused");
      }
    } else if (mirrorState === "paused") {
      await audioRef.current.resume();
      setMirrorState("speaking");
      if (activeMirrorId) {
        engineRef.current?.setMirrorState(activeMirrorId, "speaking");
      }
    }
  }, [activeMirrorId, mirrorState]);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-[#070b12]"
      onPointerDown={unlockMusicOnGesture}
    >
      {/* Dedicated Three.js Canvas Mount Container */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* WebGL Context Lost Graceful Overlay */}
      {contextLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#070b12]/95 text-center p-6">
          <div className="max-w-md space-y-2">
            <h2 className="font-display text-2xl font-semibold text-white">
              3D Graphics Context Paused
            </h2>
            <p className="text-sm text-slate-300">
              Your browser suspended WebGL rendering. Reload or focus this tab
              to restore the mirror gallery.
            </p>
          </div>
        </div>
      )}

      {/* Minimal Top-Left Header */}
      <header className="fixed top-5 left-6 z-10 pointer-events-none">
        <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-white">
          Hall of Oceanic Mirrors
        </h1>
        <div className="flex items-center gap-2 text-xs text-slate-300/90 mt-0.5">
          <span>4 Mirrors</span>
          <span aria-hidden="true">·</span>
          <span>Find a mirror to generate a face and hear its whale story</span>
        </div>
      </header>

      {/* Collapsible Bottom Control Dock */}
      <MirrorDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        proximity={proximity}
        activeMirrorId={activeMirrorId}
        mirrorState={mirrorState}
        faceInfo={faceInfo}
        discoveredMirrors={discoveredMirrors}
        musicTrack={musicTrack}
        apiError={apiError}
        ttsNotice={ttsNotice}
        storyTitle={storyTitle}
        chapterIndex={chapterIndex}
        totalChapters={totalChapters}
        chapterText={chapterText}
        onFocusMirror={handleFocusMirror}
        onGenerateFace={handleGenerateFace}
        onListen={handleListen}
        onPauseResume={handlePauseResume}
        onStopStory={handleStopAll}
        onChangeMusic={handleChangeMusic}
        onResetCollection={handleResetCollection}
        onOpenLore={() => setLoreOpen(true)}
        onClearError={() => setApiError(null)}
        onClearNotice={() => setTtsNotice(null)}
      />

      {/* Hidden Oceanic Lore & Meta-Narrative Overlay on Full Discovery */}
      <OceanicLoreModal
        open={loreOpen}
        discoveredMirrors={discoveredMirrors}
        onClose={() => setLoreOpen(false)}
        onSelectMirror={handleFocusMirror}
      />
    </div>
  );
}
