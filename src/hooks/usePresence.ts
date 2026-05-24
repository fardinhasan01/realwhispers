import { useEffect, useRef, useState } from "react";
import {
  setupPresence,
  subscribePresence,
  type PresenceState,
} from "@/services/chatService";

export function usePresence(roomCode: string | null) {
  const [partnerPresence, setPartnerPresence] = useState<PresenceState | null>(
    null,
  );
  const cleanupRef = useRef<(() => void) | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!roomCode) {
      setPartnerPresence(null);
      return;
    }

    if (cleanupRef.current) cleanupRef.current();
    if (unsubRef.current) unsubRef.current();

    cleanupRef.current = setupPresence(roomCode);
    unsubRef.current = subscribePresence(roomCode, (states) => {
      setPartnerPresence(states[0] ?? null);
    });

    return () => {
      if (cleanupRef.current) cleanupRef.current();
      if (unsubRef.current) unsubRef.current();
      cleanupRef.current = null;
      unsubRef.current = null;
    };
  }, [roomCode]);

  const statusLabel = (() => {
    if (!partnerPresence) return "Connecting…";
    if (partnerPresence.online) return "Online";
    const ago = Date.now() - partnerPresence.lastSeen;
    if (ago < 60_000) return "Last seen just now";
    if (ago < 3_600_000) {
      const mins = Math.floor(ago / 60_000);
      return `Last seen ${mins}m ago`;
    }
    return `Last seen ${new Date(partnerPresence.lastSeen).toLocaleDateString()}`;
  })();

  return {
    partnerPresence,
    isOnline: partnerPresence?.online ?? false,
    statusLabel,
  };
}
