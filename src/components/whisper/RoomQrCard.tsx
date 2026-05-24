import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { generateQRCode } from "@/services/qrService";
import type { RoomInvite } from "@/services/qrService";

interface RoomQrCardProps {
  roomCode: string;
  invite: RoomInvite;
}

export function RoomQrCard({ roomCode, invite }: RoomQrCardProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    void generateQRCode(roomCode, invite).then(setDataUrl);
  }, [roomCode, invite.token, invite.expiresAt]);

  if (!dataUrl) {
    return (
      <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-3xl glass animate-pulse">
        <span className="text-xs text-muted-foreground">Generating QR…</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="mx-auto rounded-3xl p-3 glass-strong shadow-glow-pink"
    >
      <img src={dataUrl} alt="Room QR code" className="h-52 w-52 rounded-2xl" />
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Scan to join · expires in 24h
      </p>
    </motion.div>
  );
}
