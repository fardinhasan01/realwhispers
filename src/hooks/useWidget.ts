import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeWidget,
  syncWidget,
  sendWidgetHeart,
  tapThinkingOfYou,
  type CoupleWidget,
  defaultWidget,
} from "@/services/widgetService";

export function useWidget(roomCode: string | null) {
  const [widget, setWidget] = useState<CoupleWidget>(defaultWidget());
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!roomCode) return;
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = subscribeWidget(roomCode, setWidget);
    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [roomCode]);

  const update = useCallback(
    async (patch: Partial<CoupleWidget>) => {
      if (!roomCode) return;
      await syncWidget(roomCode, patch);
    },
    [roomCode],
  );

  const sendHeart = useCallback(async () => {
    if (!roomCode) return;
    await sendWidgetHeart(roomCode);
  }, [roomCode]);

  const thinkingOfYou = useCallback(async () => {
    if (!roomCode) return;
    await tapThinkingOfYou(roomCode);
  }, [roomCode]);

  return { widget, update, sendHeart, thinkingOfYou };
}
