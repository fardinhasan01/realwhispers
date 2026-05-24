import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeMessages,
  sendMessage as sendMessageSvc,
  markMessagesSeen,
  reactToMessage as reactSvc,
  scheduleMessageExpiry,
  deleteAfterSeen,
  signalTyping,
  subscribeTyping,
  type ChatMessage,
  type MessagePayload,
} from "@/services/chatService";
import { getUserId } from "@/lib/user-id";
import type { DisappearMode } from "@/lib/whisper-store";

export function useMessages(roomCode: string | null, disappearMode: DisappearMode = "off") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubMsgRef = useRef<(() => void) | null>(null);
  const unsubTypingRef = useRef<(() => void) | null>(null);
  const expiryCleanups = useRef<Map<string, () => void>>(new Map());

  const clearExpiryTimers = useCallback(() => {
    expiryCleanups.current.forEach((fn) => fn());
    expiryCleanups.current.clear();
  }, []);

  const setupExpiryTimers = useCallback(
    (msgs: ChatMessage[]) => {
      if (!roomCode) return;
      const activeIds = new Set(msgs.map((m) => m.id));
      expiryCleanups.current.forEach((fn, id) => {
        if (!activeIds.has(id)) {
          fn();
          expiryCleanups.current.delete(id);
        }
      });
      for (const m of msgs) {
        if (expiryCleanups.current.has(m.id)) continue;
        if (m.disappearMode === "after-seen" && m.seen && m.sender !== getUserId()) {
          void deleteAfterSeen(roomCode, m);
          continue;
        }
        const cleanup = scheduleMessageExpiry(roomCode, m, () => {});
        if (cleanup.toString() !== "() => {}") {
          expiryCleanups.current.set(m.id, cleanup);
        }
      }
    },
    [roomCode],
  );

  useEffect(() => {
    if (!roomCode) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    clearExpiryTimers();

    if (unsubMsgRef.current) unsubMsgRef.current();
    if (unsubTypingRef.current) unsubTypingRef.current();

    unsubMsgRef.current = subscribeMessages(
      roomCode,
      (msgs) => {
        setMessages(msgs);
        setupExpiryTimers(msgs);
        setLoading(false);
      },
      () => setLoading(false),
    );

    unsubTypingRef.current = subscribeTyping(roomCode, setTypingUserIds);

    void markMessagesSeen(roomCode);

    return () => {
      if (unsubMsgRef.current) unsubMsgRef.current();
      if (unsubTypingRef.current) unsubTypingRef.current();
      unsubMsgRef.current = null;
      unsubTypingRef.current = null;
      clearExpiryTimers();
    };
  }, [roomCode, clearExpiryTimers, setupExpiryTimers]);

  const send = useCallback(
    async (payload: MessagePayload & { text?: string }) => {
      if (!roomCode) return;
      await sendMessageSvc(roomCode, {
        ...payload,
        disappearMode: disappearMode === "off" ? "off" : disappearMode,
      });
    },
    [roomCode, disappearMode],
  );

  const markSeen = useCallback(async () => {
    if (!roomCode) return;
    await markMessagesSeen(roomCode);
  }, [roomCode]);

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      if (!roomCode) return;
      const msg = messages.find((m) => m.id === messageId);
      await reactSvc(roomCode, messageId, emoji, msg?.reaction);
    },
    [roomCode, messages],
  );

  const onDraftChange = useCallback(() => {
    if (roomCode) signalTyping(roomCode);
  }, [roomCode]);

  const isPartnerTyping = typingUserIds.length > 0;

  return {
    messages,
    loading,
    isPartnerTyping,
    send,
    markSeen,
    react,
    onDraftChange,
  };
}

export function isMe(sender: string) {
  return sender === getUserId();
}
