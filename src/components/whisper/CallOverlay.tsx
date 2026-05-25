import type { ReactNode } from "react";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, PhoneOff, Video, Mic, MicOff, VideoOff, SwitchCamera, Volume2, VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallState } from "@/services/callService";
import { CallVideo, CallAudio } from "@/components/whisper/CallMedia";

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

interface CallOverlayProps {
  callState: CallState | null;
  incoming: { roomCode: string; state: CallState } | null;
  partnerName?: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  duration: number;
  muted: boolean;
  cameraOn: boolean;
  speakerOn?: boolean;
  error?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onToggleSpeaker?: () => void;
}

export function CallOverlay({
  callState,
  incoming,
  partnerName = "Partner",
  localStream,
  remoteStream,
  duration,
  muted,
  cameraOn,
  speakerOn = true,
  error,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
  onToggleSpeaker,
}: CallOverlayProps) {
  const status = callState?.status ?? incoming?.state.status;
  const isVideo = (callState?.type ?? incoming?.state.type) === "video";
  const isIncoming = Boolean(incoming && (!callState || callState.status === "ringing"));
  const isActive = status === "accepted";
  const isOutgoingRing = status === "ringing" && callState && !isIncoming;
  const show = isIncoming || isOutgoingRing || isActive;

  useEffect(() => {
    document.body.style.overflow = show ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [show]);

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="call-overlay fixed inset-0 z-[200] flex min-h-dvh flex-col bg-[#050208] text-white"
      role="dialog"
      aria-modal="true"
    >
      {/* Remote media layer */}
      <div className="absolute inset-0 overflow-hidden">
        {isVideo && remoteStream ? (
          <CallVideo
            stream={remoteStream}
            muted={!speakerOn}
            className="h-full w-full object-cover"
            data-remote
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-night">
            {remoteStream && <CallAudio stream={remoteStream} muted={!speakerOn} />}
            <motion.div
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-romance text-5xl shadow-glow-pink"
            >
              {isActive ? "🎧" : "📞"}
            </motion.div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
      </div>

      {/* Local PiP */}
      {isVideo && localStream && (isActive || isOutgoingRing) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "absolute z-20 overflow-hidden rounded-2xl border-2 border-white/25 shadow-2xl",
            "right-4 top-[max(1rem,env(safe-area-inset-top))]",
            "h-[28vh] max-h-44 w-[34vw] max-w-[140px] min-w-[100px]",
          )}
        >
          <CallVideo
            stream={localStream}
            muted
            mirror
            className={cn("h-full w-full object-cover", !cameraOn && "opacity-30")}
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <VideoOff className="h-8 w-8" />
            </div>
          )}
        </motion.div>
      )}

      {/* Top bar */}
      <header className="call-safe-top relative z-30 flex flex-col items-center px-4 pt-2 text-center">
        <p className="text-sm font-medium text-white/90">{partnerName}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/50">
          {isIncoming
            ? `Incoming ${isVideo ? "video" : "voice"} call`
            : isOutgoingRing
              ? "Calling…"
              : formatDuration(duration)}
        </p>
        {incoming && (
          <p className="mt-0.5 font-mono text-[10px] text-[var(--neon-cyan)]">
            {incoming.roomCode}
          </p>
        )}
        {error && (
          <p className="mt-2 max-w-xs rounded-full bg-destructive/20 px-3 py-1 text-[11px] text-red-300">
            {error}
          </p>
        )}
      </header>

      {/* Center pulse for ringing */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        {(isIncoming || isOutgoingRing) && (
          <>
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.2, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute h-48 w-48 rounded-full bg-[var(--neon-pink)]/20"
            />
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-romance text-4xl shadow-glow-pink"
            >
              {isVideo ? "📹" : "📞"}
            </motion.div>
          </>
        )}
      </div>

      {/* Controls */}
      <footer className="call-safe-bottom relative z-30 px-6 pb-4">
        {isIncoming ? (
          <div className="flex items-center justify-center gap-10">
            <CallAction
              label="Decline"
              onClick={onDecline}
              className="bg-red-500 hover:bg-red-600"
              icon={<PhoneOff className="h-7 w-7" />}
              size="lg"
            />
            <CallAction
              label="Accept"
              onClick={onAccept}
              className="bg-emerald-500 hover:bg-emerald-600"
              icon={<Phone className="h-7 w-7" />}
              size="lg"
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
            <CallAction
              label={muted ? "Unmute" : "Mute"}
              onClick={onToggleMute}
              active={muted}
              icon={muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            />
            {onToggleSpeaker && (
              <CallAction
                label="Speaker"
                onClick={onToggleSpeaker}
                active={!speakerOn}
                icon={speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
              />
            )}
            {isVideo && (
              <>
                <CallAction
                  label="Camera"
                  onClick={onToggleCamera}
                  active={!cameraOn}
                  icon={cameraOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                />
                <CallAction
                  label="Flip"
                  onClick={onSwitchCamera}
                  icon={<SwitchCamera className="h-6 w-6" />}
                />
              </>
            )}
            <CallAction
              label="End"
              onClick={onEnd}
              className="bg-red-500 hover:bg-red-600"
              icon={<PhoneOff className="h-6 w-6" />}
            />
          </div>
        )}
      </footer>
    </motion.div>
  );
}

function CallAction({
  label,
  onClick,
  icon,
  className,
  active,
  size = "md",
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  className?: string;
  active?: boolean;
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? "h-16 w-16" : "h-14 w-14";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-full transition active:scale-95",
        className ?? "bg-white/15 backdrop-blur-md hover:bg-white/25",
        active && "ring-2 ring-white/40",
        dim,
        "items-center justify-center",
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}
