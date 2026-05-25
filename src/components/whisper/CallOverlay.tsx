import { motion } from "framer-motion";
import {
  Phone, PhoneOff, Video, Mic, MicOff, VideoOff, SwitchCamera, Volume2, VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallState } from "@/services/callService";

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

interface CallOverlayProps {
  callState: CallState | null;
  incoming: { roomCode: string; state: CallState } | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  duration: number;
  muted: boolean;
  cameraOn: boolean;
  speakerOn?: boolean;
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
  localStream,
  remoteStream,
  duration,
  muted,
  cameraOn,
  speakerOn = true,
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
  const show = status === "ringing" || status === "accepted" || incoming;

  if (!show) return null;

  const isIncoming = incoming && !callState;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-2xl"
    >
      {isVideo && remoteStream && (
        <video
          data-remote
          autoPlay
          playsInline
          ref={(el) => { if (el && remoteStream) el.srcObject = remoteStream; }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {isVideo && localStream && (
        <video
          autoPlay
          playsInline
          muted
          ref={(el) => { if (el && localStream) el.srcObject = localStream; }}
          className="absolute bottom-28 right-4 h-36 w-28 rounded-2xl border-2 border-white/20 object-cover shadow-lg"
        />
      )}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        {isIncoming ? (
          <>
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-romance text-4xl shadow-glow-pink"
            >
              {isVideo ? "📹" : "📞"}
            </motion.div>
            <h2 className="font-display text-2xl font-bold">Incoming {isVideo ? "video" : "voice"} call</h2>
            <p className="mt-2 text-sm text-muted-foreground">Room {incoming.roomCode}</p>
            <div className="mt-10 flex gap-6">
              <button
                type="button"
                onClick={onDecline}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive shadow-lg"
              >
                <PhoneOff className="h-7 w-7 text-white" />
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg"
              >
                <Phone className="h-7 w-7 text-white" />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm uppercase tracking-widest text-muted-foreground">
              {status === "ringing" ? "Calling…" : formatDuration(duration)}
            </p>
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="mt-8 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-aurora text-3xl"
            >
              💜
            </motion.div>
          </>
        )}
      </div>

      {!isIncoming && (
        <div className="relative z-10 flex items-center justify-center gap-4 pb-12">
          <CallBtn onClick={onToggleMute} active={muted} icon={muted ? MicOff : Mic} label="Mute" />
          {onToggleSpeaker && (
            <CallBtn
              onClick={onToggleSpeaker}
              active={!speakerOn}
              icon={speakerOn ? Volume2 : VolumeX}
              label="Speaker"
            />
          )}
          {isVideo && (
            <>
              <CallBtn onClick={onToggleCamera} active={!cameraOn} icon={cameraOn ? Video : VideoOff} label="Cam" />
              <CallBtn onClick={onSwitchCamera} icon={SwitchCamera} label="Flip" />
            </>
          )}
          <button
            type="button"
            onClick={onEnd}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive shadow-lg"
          >
            <PhoneOff className="h-6 w-6 text-white" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

function CallBtn({
  onClick, icon: Icon, label, active,
}: {
  onClick: () => void;
  icon: typeof Mic;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 w-12 flex-col items-center justify-center rounded-full glass text-xs",
        active && "bg-white/20",
      )}
      aria-label={label}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
