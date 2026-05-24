import { useCallback, useEffect, useRef, useState } from "react";
import {
  CallService,
  subscribeIncomingCalls,
  type CallState,
  type CallType,
} from "@/services/callService";
import { getRooms } from "@/lib/whisper-store";
import { haptic } from "@/lib/haptics";

export function useCall(roomCode: string | null) {
  const svcRef = useRef<CallService | null>(null);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<{ roomCode: string; state: CallState } | null>(null);

  useEffect(() => {
    const svc = new CallService({
      onStateChange: setCallState,
      onLocalStream: setLocalStream,
      onRemoteStream: setRemoteStream,
      onDuration: setDuration,
      onError: setError,
    });
    svcRef.current = svc;
    if (roomCode) svc.listen(roomCode);
    return () => {
      svc.stopListening();
      void svc.endCall();
    };
  }, [roomCode]);

  useEffect(() => {
    const codes = getRooms().map((r) => r.id);
    if (!codes.length) return;
  return subscribeIncomingCalls(codes, (code, state) => {
      setIncoming({ roomCode: code, state });
      haptic("heavy");
    });
  }, []);

  const startVoice = useCallback(async () => {
    if (!roomCode || !svcRef.current) return;
    haptic("medium");
    await svcRef.current.startCall(roomCode, "voice");
  }, [roomCode]);

  const startVideo = useCallback(async () => {
    if (!roomCode || !svcRef.current) return;
    haptic("medium");
    await svcRef.current.startCall(roomCode, "video");
  }, [roomCode]);

  const accept = useCallback(async (code?: string) => {
    const c = code ?? roomCode;
    if (!c || !svcRef.current) return;
    haptic("success");
    setIncoming(null);
    await svcRef.current.acceptCall(c);
  }, [roomCode]);

  const decline = useCallback(async (code?: string) => {
    const c = code ?? roomCode;
    if (!c || !svcRef.current) return;
    setIncoming(null);
    await svcRef.current.declineCall(c);
  }, [roomCode]);

  const end = useCallback(async () => {
    await svcRef.current?.endCall();
    setDuration(0);
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

  const isActive = callState?.status === "accepted" || callState?.status === "ringing";

  return {
    callState,
    localStream,
    remoteStream,
    duration,
    muted,
    cameraOn,
    error,
    incoming,
    isActive,
    startVoice,
    startVideo,
    accept,
    decline,
    end,
    toggleMute,
    toggleCamera,
    switchCamera,
  };
}

export type { CallType, CallState };
