import { useCallback, useEffect, useRef, useState } from "react";
import { onValue } from "firebase/database";
import { getDb, ref } from "@/lib/firebase";
import {
  getPartnerNickname,
  getUsers,
  type FirebaseRoom,
} from "@/services/roomService";
import { getUserId } from "@/lib/user-id";
import { normalizeRoomCode } from "@/lib/room-code";
import type { DisappearMode } from "@/lib/whisper-store";
import type { RoomInvite } from "@/services/qrService";

export interface RoomView {
  id: string;
  members: Record<string, boolean>;
  partnerNickname: string;
  myNickname: string;
  mood?: string;
  theme?: "rose" | "violet" | "cyan" | "aurora";
  disappear: DisappearMode;
  memberCount: number;
  isMember: boolean;
  invite?: RoomInvite | null;
}

function toRoomView(roomCode: string, data: FirebaseRoom | null): RoomView | null {
  if (!data) return null;
  const uid = getUserId();
  const users = getUsers(data);
  return {
    id: roomCode,
    members: users,
    partnerNickname: getPartnerNickname(data),
    myNickname: data.nicknames?.[uid] ?? "Me",
    mood: data.mood,
    theme: data.theme ?? "rose",
    disappear: (data.disappear as DisappearMode) ?? "off",
    memberCount: Object.keys(users).filter((k) => users[k]).length,
    isMember: Boolean(users[uid]),
    invite: data.invite ?? null,
  };
}

export function useRoom(roomCode: string | null) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const normalizedCode = roomCode ? normalizeRoomCode(roomCode) : null;

  useEffect(() => {
    if (!normalizedCode) {
      setRoom(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    const db = getDb();
    const roomRef = ref(db, `rooms/${normalizedCode}`);

    const unsub = onValue(
      roomRef,
      (snap) => {
        if (!snap.exists()) {
          console.warn("[WhisperLock] useRoom — room not found", { code: normalizedCode });
          setRoom(null);
          setError("Room not found");
        } else {
          const view = toRoomView(normalizedCode, snap.val() as FirebaseRoom);
          console.log("[WhisperLock] useRoom — update", {
            code: normalizedCode,
            isMember: view?.isMember,
            members: view?.memberCount,
          });
          setRoom(view);
          setError(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[WhisperLock] useRoom listener error", err);
        setError(err.message);
        setLoading(false);
      },
    );

    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [normalizedCode]);

  const refresh = useCallback(() => {
    // realtime listener keeps data fresh
  }, []);

  return { room, loading, error, refresh };
}
