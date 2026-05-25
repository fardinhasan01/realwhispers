import { useCallback, useEffect, useRef, useState } from "react";
import {
  CallService,
  subscribeIncomingCalls,
  type CallState,
  type CallType,
} from "@/services/callService";
import { getRooms } from "@/lib/whisper-store";
import { getUserId } from "@/lib/user-id";
import { normalizeRoomCode } from "@/lib/room-code";
import { haptic } from "@/lib/haptics";

export function useCall(roomCode: string | null) {
  const svcRef = useRef<CallService | null>(null);
  const activeRef = useRef(false);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<{ roomCode: string; state: CallState } | null>(null);

  useEffect(() => {
    const svc = new CallService({
      onStateChange: (s) => {
        setCallState(s);
        activeRef.current = s?.status === "accepted" || s?.status === "ringing";
        if (s?.status === "ended" || s?.status === "rejected" || s?.status === "missed") {
          activeRef.current = false;
          setDuration(0);
        }
      },
      onLocalStream: setLocalStream,
      onRemoteStream: setRemoteStream,
      onDuration: setDuration,
      onError: (msg) => {
        if (msg) {
          console.error("[WhisperLock] call error", msg);
          setError(msg);
        }
      },
    });
    svcRef.current = svc;
    if (roomCode) svc.listen(roomCode);

    return () => {
      svc.stopListening();
      if (activeRef.current) void svc.endCall("ended");
      else void svc.cleanup();
    };
  }, [roomCode]);

  useEffect(() => {
    const codes = getRooms().map((r) => r.id);
    if (!codes.length) return;

    return subscribeIncomingCalls(codes, (code, state) => {
      const c = normalizeRoomCode(code);
      if (roomCode && normalizeRoomCode(roomCode) === c && state.callerId === getUserId()) {
        return;
      }
      setIncoming({ roomCode: c, state });
      haptic("heavy");
    });
  }, [roomCode]);

  const startVoice = useCallback(async () => {
    if (!roomCode || !svcRef.current) return;
    setError(null);
    setIncoming(null);
    haptic("medium");
    await svcRef.current.startVoiceCall(roomCode);
  }, [roomCode]);

  const startVideo = useCallback(async () => {
    if (!roomCode || !svcRef.current) return;
    setError(null);
    setIncoming(null);
    haptic("medium");
    await svcRef.current.startVideoCall(roomCode);
  }, [roomCode]);

  const accept = useCallback(async (code?: string) => {
    const c = code ?? roomCode;
    if (!c || !svcRef.current) return;
    setError(null);
    haptic("success");
    setIncoming(null);
    await svcRef.current.acceptCall(c);
  }, [roomCode]);

  const decline = useCallback(async (code?: string) => {
    const c = code ?? roomCode;
    if (!c || !svcRef.current) return;
    setIncoming(null);
    await svcRef.current.rejectCall(c);
  }, [roomCode]);

  const end = useCallback(async () => {
    setIncoming(null);
    await svcRef.current?.endCall("ended");
    setDuration(0);
    activeRef.current = false;
  }, []);

  const toggleMute = useCallback(() => {
    const m = svcRef.current?.toggleMute() ?? false;
    setMuted(m);
  }, []);

  const toggleCamera = useCallback(() => {
    const on = svcRef.current?.toggleCamera() ?? false;
    setCameraOn(on);
  }, []);

  const switchCamera = useCallback(() => {
    void svcRef.current?.switchCamera();
  }, []);

  const toggleSpeaker = useCallback(() => {
    const on = svcRef.current?.toggleSpeakerMode() ?? true;
    setSpeakerOn(on);
  }, []);

  const isActive =
    callState?.status === "accepted" ||
    callState?.status === "ringing" ||
    Boolean(incoming);

  return {
    callState,
    localStream,
    remoteStream,
    duration,
    muted,
    cameraOn,
    speakerOn,
    error,
    incoming,
    isActive,
    startVoice,
    startVideo,
    startVoiceCall: startVoice,
    startVideoCall: startVideo,
    accept,
    decline,
    reject: decline,
    end,
    toggleMute,
    toggleCamera,
    switchCamera,
    toggleSpeaker,
  };
}

export type { CallType, CallState };
