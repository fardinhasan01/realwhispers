import { useEffect, useRef } from "react";

/** Binds MediaStream to video element — fixes blank preview on Android WebView */
export function CallVideo({
  stream,
  muted = false,
  mirror = false,
  className,
  "data-remote": dataRemote,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
  "data-remote"?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => {
        /* autoplay policy */
      });
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      data-call-remote-video={dataRemote ? true : undefined}
      className={className}
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

/** Remote audio for voice-only calls */
export function CallAudio({ stream, muted = false }: { stream: MediaStream | null; muted?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      data-call-remote-audio
      className="sr-only"
    />
  );
}
