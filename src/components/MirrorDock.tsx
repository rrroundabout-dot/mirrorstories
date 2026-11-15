import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Compass,
  Headphones,
  Loader2,
  Music,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import {
  GeneratedFaceInfo,
  MirrorActivityState,
  MirrorId,
  MUSIC_TRACKS,
  MusicTrackId,
  ProximitySnapshot,
  ROOM_MIRRORS,
} from "../types/mirror";

interface MirrorDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  proximity: ProximitySnapshot;
  activeMirrorId: MirrorId | null;
  mirrorState: MirrorActivityState;
  faceInfo: GeneratedFaceInfo | null;
  discoveredMirrors: MirrorId[];
  musicTrack: MusicTrackId;
  apiError: string | null;
  ttsNotice: string | null;
  storyTitle: string | null;
  chapterIndex: number;
  totalChapters: number;
  chapterText: string;
  onFocusMirror: (id: MirrorId) => void;
  onGenerateFace: () => void;
  onListen: () => void;
  onPauseResume: () => void;
  onStopStory: () => void;
  onChangeMusic: (trackId: MusicTrackId) => void;
  onResetCollection: () => void;
  onOpenLore: () => void;
  onClearError: () => void;
  onClearNotice: () => void;
}

export function MirrorDock({
  collapsed,
  onToggleCollapse,
  proximity,
  activeMirrorId,
  mirrorState,
  faceInfo,
  discoveredMirrors,
  musicTrack,
  apiError,
  ttsNotice,
  storyTitle,
  chapterIndex,
  totalChapters,
  chapterText,
  onFocusMirror,
  onGenerateFace,
  onListen,
  onPauseResume,
  onStopStory,
  onChangeMusic,
  onResetCollection,
  onOpenLore,
  onClearError,
  onClearNotice,
}: MirrorDockProps) {
  const focusedMirror =
    ROOM_MIRRORS.find((m) => m.id === activeMirrorId) || proximity.nearestMirror;
  const isSpeakingOrPaused =
    mirrorState === "speaking" || mirrorState === "paused";

  return (
    <>
      {/* Main Sliding Dock Container */}
      <div
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-20 w-[min(960px,95vw)] transition-transform duration-300 ease-out pointer-events-none ${
          collapsed ? "translate-y-[calc(100%+40px)]" : "translate-y-0"
        }`}
      >
        {/* Collapse button attached to top edge when expanded */}
        {!collapsed && (
          <div className="flex justify-center mb-2 pointer-events-auto">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-[#0b111c]/95 border border-white/15 rounded-md hover:bg-[#131d2e] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Hide controls (H)"
            >
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Hide Controls</span>
            </button>
          </div>
        )}

        {/* Main Dock Panel */}
        <div className="pointer-events-auto bg-[#0a101a]/94 border border-white/14 rounded-xl shadow-2xl p-4 flex flex-col gap-3">
        {/* Error strip */}
        {apiError && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-rose-950/75 border border-rose-500/35 text-xs text-rose-100">
            <span>{apiError}</span>
            <button
              type="button"
              onClick={onClearError}
              className="px-2 py-1 text-rose-200 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Non-blocking voice fallback notice strip */}
        {ttsNotice && !apiError && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-amber-950/65 border border-amber-400/30 text-xs text-amber-100">
            <span>{ttsNotice}</span>
            <button
              type="button"
              onClick={onClearNotice}
              className="px-2 py-1 text-amber-200 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Spoken Story Caption Strip */}
        {isSpeakingOrPaused && chapterText && (
          <div className="border-b border-white/10 pb-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-4 text-xs text-slate-400">
              <span className="font-display text-base font-semibold text-sky-200 truncate">
                {storyTitle || "A Slightly Damp Whale Tale"}
              </span>
              <span className="font-mono-num whitespace-nowrap shrink-0 text-slate-300">
                Chapter {chapterIndex + 1} of {totalChapters}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-100 max-h-24 overflow-y-auto pr-1">
              {chapterText}
            </p>
          </div>
        )}

        {/* Primary Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Active / Nearest Mirror Context */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{focusedMirror.wallLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">
                {proximity.distance.toFixed(1)} m
              </span>
              {faceInfo && mirrorState !== "idle" ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-300 truncate">
                    Reflection: {faceInfo.personaName} ({faceInfo.traitLabel})
                  </span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{focusedMirror.subtitle}</span>
                </>
              )}
            </div>
            <div className="font-display text-xl font-semibold text-white truncate">
              {focusedMirror.name}
            </div>
          </div>

          {/* Contextual Mirror Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {mirrorState === "idle" && !proximity.inRange && (
              <button
                type="button"
                onClick={() => onFocusMirror(proximity.nearestMirror.id)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-white/15 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Compass className="w-4 h-4 text-sky-400" />
                <span>Find Nearest Mirror</span>
              </button>
            )}

            {mirrorState === "idle" && proximity.inRange && (
              <button
                type="button"
                onClick={onGenerateFace}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate Face</span>
              </button>
            )}

            {mirrorState === "face_ready" && (
              <>
                <button
                  type="button"
                  onClick={onListen}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-slate-950 bg-teal-300 hover:bg-teal-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Headphones className="w-4 h-4" />
                  <span>Listen</span>
                </button>
                <button
                  type="button"
                  onClick={onGenerateFace}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/12 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-4 h-4 text-sky-300" />
                  <span>New Face</span>
                </button>
              </>
            )}

            {mirrorState === "generating" && (
              <div className="inline-flex items-center gap-2.5 px-4 py-2 text-sm text-sky-200 bg-sky-950/70 border border-sky-400/30 rounded-lg whitespace-nowrap shrink-0">
                <Loader2 className="w-4 h-4 animate-spin text-sky-300" />
                <span>Snapshotting face &amp; composing whale story...</span>
              </div>
            )}

            {isSpeakingOrPaused && (
              <>
                <button
                  type="button"
                  onClick={onPauseResume}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-white/15 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {mirrorState === "paused" ? (
                    <>
                      <Play className="w-4 h-4 text-teal-300" />
                      <span>Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 text-sky-300" />
                      <span>Pause</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onStopStory}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/12 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 text-rose-300" />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Background Music Switcher Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 mr-1 whitespace-nowrap shrink-0">
              <Music className="w-3.5 h-3.5 text-sky-400" />
              <span>Music</span>
            </span>
            {MUSIC_TRACKS.map((track) => {
              const active = musicTrack === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => onChangeMusic(track.id)}
                  title={track.mood}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? "bg-sky-400/20 text-sky-200 border border-sky-400/40"
                      : "bg-white/4 text-slate-300 hover:bg-white/10 hover:text-white border border-transparent"
                  }`}
                >
                  {track.label}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 whitespace-nowrap shrink-0">
            WASD to walk · Drag to look · Click a mirror
          </div>
        </div>

        {/* Mini Mirror Collection List */}
        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="font-medium text-slate-200">
                Mirror Collection
              </span>
              <span className="font-mono-num text-teal-300">
                {discoveredMirrors.length}/{ROOM_MIRRORS.length} discovered
              </span>
            </div>
            {discoveredMirrors.length > 0 && (
              <div className="flex items-center gap-1.5">
                {discoveredMirrors.length === ROOM_MIRRORS.length && (
                  <button
                    type="button"
                    onClick={onOpenLore}
                    title="View hidden oceanic lore"
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-teal-200 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-400/35 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>Read Lore</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onResetCollection}
                  title="Clear discovered mirror history"
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200 bg-white/4 hover:bg-white/10 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {ROOM_MIRRORS.map((mirror) => {
              const isDiscovered = discoveredMirrors.includes(mirror.id);
              const isSelected =
                (activeMirrorId && activeMirrorId === mirror.id) ||
                (!activeMirrorId && proximity.nearestMirror.id === mirror.id);
              return (
                <button
                  key={mirror.id}
                  type="button"
                  onClick={() => onFocusMirror(mirror.id)}
                  title={`${mirror.name} — ${
                    isDiscovered ? "Discovered" : "Not yet visited"
                  }`}
                  className={`flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg border transition-colors cursor-pointer min-w-0 ${
                    isSelected
                      ? "bg-white/12 border-white/30 text-white"
                      : isDiscovered
                      ? "bg-teal-950/35 border-teal-400/25 text-slate-100 hover:bg-teal-950/55"
                      : "bg-white/4 border-white/8 text-slate-400 hover:bg-white/8 hover:text-slate-200"
                  }`}
                >
                  {isDiscovered ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                  ) : (
                    <CircleDashed className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">
                      {mirror.name.split(" ").slice(-1)[0]}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate">
                      {mirror.wallLabel.split(" ")[0]} ·{" "}
                      {isDiscovered ? "Found" : "Unseen"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>

    {collapsed && (
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-100 bg-[#0b111c]/95 border border-white/18 rounded-md shadow-xl hover:bg-[#131d2e] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title="Show controls (H)"
        >
          <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
          <span>Show Controls</span>
        </button>
      </div>
    )}
    </>
  );
}
