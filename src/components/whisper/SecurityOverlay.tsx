import { useEffect, useState } from "react";
import { getSettings } from "@/lib/whisper-store";

export function SecurityOverlay() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const settings = getSettings();
    if (!settings.blurMultitasking) return;

    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!hidden) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-3xl"
      aria-hidden
    >
      <div className="text-center">
        <p className="font-display text-2xl font-bold text-gradient-romance">
          WhisperLock
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Vault hidden</p>
      </div>
    </div>
  );
}
