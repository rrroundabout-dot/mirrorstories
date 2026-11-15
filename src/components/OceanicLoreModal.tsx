import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Compass, Sparkles, X } from "lucide-react";
import { MirrorId, ROOM_MIRRORS } from "../types/mirror";

interface OceanicLoreModalProps {
  open: boolean;
  discoveredMirrors: MirrorId[];
  onClose: () => void;
  onSelectMirror: (id: MirrorId) => void;
}

export function OceanicLoreModal({
  open,
  discoveredMirrors,
  onClose,
  onSelectMirror,
}: OceanicLoreModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const orderedMirrors = discoveredMirrors
    .map((id) => ROOM_MIRRORS.find((m) => m.id === id))
    .filter((m): m is (typeof ROOM_MIRRORS)[number] => Boolean(m));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          onClick={onClose}
          className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-[#040911]/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="oceanic-lore-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl rounded-2xl bg-[#0a121f]/98 border border-teal-400/30 shadow-2xl overflow-hidden"
          >
            {/* Subtle top hairline accent */}
            <div className="h-1 w-full bg-gradient-to-r from-sky-400/70 via-teal-300/80 to-indigo-400/70" />

            <div className="p-6 sm:p-7 flex flex-col gap-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-mono-num uppercase tracking-wider text-teal-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      All {ROOM_MIRRORS.length} Mirrors Attuned · Hidden Archive
                    </span>
                  </div>
                  <h2
                    id="oceanic-lore-title"
                    className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-white"
                  >
                    The Ledger of the Four Reflections
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close oceanic lore"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Meta-narrative & Lore Body */}
              <div className="space-y-3.5 text-sm leading-relaxed text-slate-200/95">
                <p>
                  You were never exploring an ordinary gallery. In 1887, an
                  over-fastidious British hydrographer named Rear-Admiral
                  Humphrey Barnaby attempted to catalogue every whale song in the
                  abyssal trenches by silvering four compass mirrors with
                  deep-sea bioluminescence.
                </p>
                <p>
                  Naturally, something went slightly awry. Rather than
                  recording the whales, each mirror retained one terribly
                  self-conscious facet of whoever stood before it—forever
                  clearing its throat, apologising for the damp carpet, and
                  rambling at great length about cetaceans whenever a listener
                  draws near.
                </p>
                <p className="text-sky-200/95 border-l-2 border-teal-400/50 pl-3.5 italic">
                  With all four walls awakened, the bronze fluke at the centre
                  of the room hums at forty hertz—quietly confirming that you
                  and the glass have been talking about the ocean for quite some
                  time, and mustn&apos;t grumble about the lack of a kettle.
                </p>
              </div>

              {/* Discovery Sequence Summary */}
              {orderedMirrors.length > 0 && (
                <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                    <span>Your Attunement Order (click to revisit):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {orderedMirrors.map((mirror, idx) => (
                      <button
                        key={mirror.id}
                        type="button"
                        onClick={() => {
                          onSelectMirror(mirror.id);
                          onClose();
                        }}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/4 hover:bg-white/10 border border-white/8 text-left transition-colors cursor-pointer"
                      >
                        <span className="font-mono-num text-xs text-teal-300 shrink-0">
                          0{idx + 1}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium text-white truncate">
                            {mirror.name}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate">
                            {mirror.subtitle}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Action */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-teal-300 hover:bg-teal-200 rounded-lg transition-colors cursor-pointer"
                >
                  <Compass className="w-4 h-4" />
                  <span>Return to Gallery</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
