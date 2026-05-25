import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, QrCode, Settings, LogOut, Trash2, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import { RoomQrCard } from "@/components/whisper/RoomQrCard";
import type { RoomInvite } from "@/services/qrService";
import { normalizeRoomCode } from "@/lib/room-code";
import { haptic } from "@/lib/haptics";

interface RoomMenuProps {
  open: boolean;
  onClose: () => void;
  roomCode: string;
  invite: RoomInvite | null;
  onLeave: () => void;
  onDelete: () => void;
  onSettings?: () => void;
}

export function RoomMenu({
  open,
  onClose,
  roomCode,
  invite,
  onLeave,
  onDelete,
  onSettings,
}: RoomMenuProps) {
  const [copied, setCopied] = useState(false);
  const code = normalizeRoomCode(roomCode);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      haptic("light");
      toast.success("Room code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-label="Close menu"
          />
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="glass-strong fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl px-5 pb-8 pt-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Room</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-1 text-center font-mono text-sm tracking-widest text-[var(--neon-cyan)]">
              {code}
            </p>

            {invite ? (
              <RoomQrCard roomCode={code} invite={invite} />
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                QR invite loading…
              </p>
            )}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => void copyCode()}
                className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm hover:bg-white/10"
              >
                {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
                {copied ? "Copied!" : "Copy room code"}
              </button>
              {onSettings && (
                <button
                  type="button"
                  onClick={() => { onSettings(); onClose(); }}
                  className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm hover:bg-white/10"
                >
                  <Settings className="h-5 w-5" />
                  Room settings
                </button>
              )}
              <button
                type="button"
                onClick={() => { onLeave(); onClose(); }}
                className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm hover:bg-white/10"
              >
                <LogOut className="h-5 w-5" />
                Leave room
              </button>
              <button
                type="button"
                onClick={() => { onDelete(); onClose(); }}
                className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-5 w-5" />
                Delete room &amp; clear chat
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Fetch invite for menu when only room code is known */
export function useRoomInvite(roomCode: string | null): RoomInvite | null {
  const [invite, setInvite] = useState<RoomInvite | null>(null);

  useEffect(() => {
    if (!roomCode) {
      setInvite(null);
      return;
    }
    void import("@/services/roomService").then(({ getRoom }) =>
      getRoom(roomCode).then((room) => {
        if (room?.invite) setInvite(room.invite);
      }),
    );
  }, [roomCode]);

  return invite;
}
