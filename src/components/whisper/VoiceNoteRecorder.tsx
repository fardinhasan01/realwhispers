import { motion, AnimatePresence } from "framer-motion";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecorderStatus } from "@/hooks/useVoiceRecorder";

interface VoiceNoteRecorderProps {
  status: RecorderStatus;
  durationLabel: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
}

export function VoiceNoteRecorder({
  status,
  durationLabel,
  onStart,
  onPause,
  onResume,
  onStop,
  onCancel,
}: VoiceNoteRecorderProps) {
  if (status === "idle") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="glass mx-3 mb-2 flex items-center gap-3 rounded-2xl px-4 py-3"
      >
        <motion.span
          animate={{ scale: status === "recording" ? [1, 1.2, 1] : 1 }}
          transition={{ repeat: status === "recording" ? Infinity : 0, duration: 1 }}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            status === "recording" ? "bg-red-500/90 text-white" : "bg-white/10",
          )}
        >
          <Mic className="h-5 w-5" />
        </motion.span>
        <div className="flex-1">
          <p className="text-xs font-medium">
            {status === "paused" ? "Paused" : "Recording voice…"}
          </p>
          <p className="font-mono text-lg tabular-nums text-[var(--neon-pink)]">
            {durationLabel}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {status === "recording" ? (
            <button
              type="button"
              onClick={onPause}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Pause"
            >
              <Pause className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onResume}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Resume"
            >
              <Play className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-romance text-white"
            aria-label="Send voice note"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
            aria-label="Cancel"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
