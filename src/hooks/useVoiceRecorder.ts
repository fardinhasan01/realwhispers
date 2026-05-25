import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "paused";

export function useVoiceRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [durationSec, setDurationSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tickDuration = useCallback(() => {
    const elapsed = Date.now() - startedAtRef.current - pausedAccumRef.current;
    setDurationSec(Math.floor(elapsed / 1000));
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (status === "recording") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(200);
      startedAtRef.current = Date.now();
      pausedAccumRef.current = 0;
      setDurationSec(0);
      setStatus("recording");
      clearTimer();
      timerRef.current = setInterval(tickDuration, 250);
      console.log("[WhisperLock] voice — recording started");
    } catch (err) {
      console.error("[WhisperLock] voice — mic permission denied", err);
      throw new Error("Microphone permission required for voice notes");
    }
  }, [status, clearTimer, tickDuration]);

  const pause = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || status !== "recording") return;
    if (typeof rec.pause === "function") {
      rec.pause();
      pauseStartedRef.current = Date.now();
      setStatus("paused");
      clearTimer();
      console.log("[WhisperLock] voice — paused");
    }
  }, [status, clearTimer]);

  const resume = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || status !== "paused") return;
    if (typeof rec.resume === "function") {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
      rec.resume();
      setStatus("recording");
      timerRef.current = setInterval(tickDuration, 250);
      console.log("[WhisperLock] voice — resumed");
    }
  }, [status, clearTimer, tickDuration]);

  const cancel = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    clearTimer();
    stopTracks();
    setStatus("idle");
    setDurationSec(0);
    console.log("[WhisperLock] voice — cancelled");
  }, [clearTimer, stopTracks]);

  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === "inactive") {
        cancel();
        resolve(null);
        return;
      }
      rec.onstop = () => {
        clearTimer();
        stopTracks();
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        setStatus("idle");
        setDurationSec(0);
        if (blob.size < 100) {
          console.warn("[WhisperLock] voice — empty recording");
          resolve(null);
          return;
        }
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice_${Date.now()}.${ext}`, {
          type: blob.type,
        });
        console.log("[WhisperLock] voice — saved", { size: file.size, type: file.type });
        resolve(file);
      };
      rec.stop();
    });
  }, [cancel, clearTimer, stopTracks]);

  useEffect(() => () => {
    cancel();
  }, [cancel]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return {
    status,
    durationSec,
    durationLabel: formatDuration(durationSec),
    start,
    pause,
    resume,
    stop,
    cancel,
    isActive: status === "recording" || status === "paused",
  };
}
