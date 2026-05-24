import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getSettings, isUnlocked, setUnlocked } from "@/lib/whisper-store";

const EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

export function useInactivityLock() {
  const nav = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (!isUnlocked()) return;
      const mins = getSettings().autoLockMinutes;
      if (!mins || mins <= 0) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => {
          setUnlocked(false);
          nav({ to: "/lock" });
        },
        mins * 60_000,
      );
    };

    reset();
    for (const ev of EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of EVENTS) {
        window.removeEventListener(ev, reset);
      }
    };
  }, [nav]);
}
