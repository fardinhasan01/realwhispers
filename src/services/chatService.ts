import { get } from "firebase/database";
import {
  getDb,
  ref,
  push,
  set,
  update,
  remove,
  serverTimestamp,
  onValue,
} from "@/lib/firebase";
import type { Unsubscribe } from "firebase/database";
import { ensureAuth } from "@/lib/firebase";
import { getUserId, initUserId } from "@/lib/user-id";
import { incrementPartnerUnread, clearUnread, setUserOnline } from "@/services/roomService";

async function ensureReady() {
  await ensureAuth();
  await initUserId();
}

function roomPath(code: string) {
  return `rooms/${normalizeRoomCode(code)}`;
}

function messagesRef(roomCode: string) {
  return ref(getDb(), `${roomPath(roomCode)}/messages`);
}

function typingRef(roomCode: string) {
  return ref(getDb(), `${roomPath(roomCode)}/typing`);
}

function presenceRef(roomCode: string) {
  return ref(getDb(), `${roomPath(roomCode)}/userMeta`);
}

import { normalizeRoomCode } from "@/lib/room-code";

export type MessageType = "text" | "image" | "file" | "audio" | "video";
export type DisappearMode = "off" | "5s" | "30s" | "1m" | "after-seen" | "1h";

export interface ChatMessage {
  id: string;
  text?: string;
  /** @deprecated use fileUrl */
  mediaUrl?: string;
  fileUrl?: string;
  fileName?: string;
  sender: string;
  senderId?: string;
  timestamp: number;
  type: MessageType;
  seen: boolean;
  disappearMode: DisappearMode | string;
  reaction?: string;
  replyToId?: string;
  pinned?: boolean;
}

export interface MessagePayload {
  text?: string;
  mediaUrl?: string;
  fileUrl?: string;
  fileName?: string;
  type?: MessageType;
  disappearMode?: DisappearMode | string;
  replyToId?: string;
  reaction?: string;
}

const disappearMs = (mode: string): number | null => {
  switch (mode) {
    case "5s": return 5_000;
    case "30s": return 30_000;
    case "1m": return 60_000;
    case "1h": return 3_600_000;
    default: return null;
  }
};

export function parseMessages(
  data: Record<string, Omit<ChatMessage, "id">> | null,
): ChatMessage[] {
  if (!data) return [];
  return Object.entries(data)
    .map(([id, m]) => {
      const fileUrl = m.fileUrl ?? m.mediaUrl;
      return {
        id,
        ...m,
        sender: m.sender ?? m.senderId ?? "",
        senderId: m.senderId ?? m.sender ?? "",
        fileUrl,
        mediaUrl: fileUrl,
        timestamp:
          typeof m.timestamp === "number"
            ? m.timestamp
            : (m.timestamp as { seconds?: number })?.seconds
              ? (m.timestamp as { seconds: number }).seconds * 1000
              : Date.now(),
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Realtime message listener — rooms/{code}/messages */
export function listenMessages(
  roomCode: string,
  onData: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeMessages(roomCode, onData, onError);
}

export function subscribeMessages(
  roomCode: string,
  onData: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const code = normalizeRoomCode(roomCode);
  console.log("[WhisperLock] listenMessages", { path: `${roomPath(code)}/messages` });
  return onValue(
    messagesRef(code),
    (snap) => onData(parseMessages(snap.val())),
    (err) => onError?.(err),
  );
}

export async function sendMessage(
  roomCode: string,
  messageData: MessagePayload,
): Promise<string> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const uid = getUserId();
  const newRef = push(messagesRef(code));
  const id = newRef.key!;
  const fileUrl = messageData.fileUrl ?? messageData.mediaUrl ?? null;
  await set(newRef, {
    text: messageData.text ?? "",
    fileUrl,
    fileName: messageData.fileName ?? null,
    senderId: uid,
    sender: uid,
    timestamp: serverTimestamp(),
    type: messageData.type ?? (fileUrl ? "file" : "text"),
    seen: false,
    disappearMode: messageData.disappearMode ?? "off",
    replyToId: messageData.replyToId ?? null,
    reaction: messageData.reaction ?? null,
  });
  void incrementPartnerUnread(code, uid);
  return id;
}

export async function markMessagesSeen(roomCode: string): Promise<void> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const uid = getUserId();
  const snap = await get(messagesRef(code));
  if (!snap.exists()) return;
  const data = snap.val() as Record<string, ChatMessage>;
  const updates: Record<string, unknown> = {};
  for (const [id, msg] of Object.entries(data)) {
    const sender = msg.sender ?? msg.senderId;
    if (sender !== uid && !msg.seen) {
      updates[`${roomPath(code)}/messages/${id}/seen`] = true;
    }
  }
  if (Object.keys(updates).length) await update(ref(getDb()), updates);
  await clearUnread(code);
}

export async function reactToMessage(
  roomCode: string,
  messageId: string,
  emoji: string,
  current?: string,
): Promise<void> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const uid = getUserId();
  const emojiVal = current === emoji ? null : emoji;
  await update(ref(getDb(), `${roomPath(code)}/messages/${messageId}`), {
    reaction: emojiVal,
  });
  await set(ref(getDb(), `${roomPath(code)}/reactions/${messageId}/${uid}`), emojiVal);
}

export async function deleteMessage(roomCode: string, messageId: string): Promise<void> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  await remove(ref(getDb(), `${roomPath(code)}/messages/${messageId}`));
}

export function scheduleMessageExpiry(
  roomCode: string,
  message: ChatMessage,
  onExpired: () => void,
): () => void {
  const mode = message.disappearMode;
  if (mode === "off" || mode === "after-seen") return () => {};
  const ms = disappearMs(mode);
  if (!ms) return () => {};
  const remaining = Math.max(0, ms - (Date.now() - message.timestamp));
  const timer = window.setTimeout(async () => {
    await deleteMessage(roomCode, message.id);
    onExpired();
  }, remaining);
  return () => clearTimeout(timer);
}

export async function deleteAfterSeen(roomCode: string, message: ChatMessage): Promise<void> {
  if (message.disappearMode !== "after-seen" || !message.seen) return;
  const sender = message.sender ?? message.senderId;
  if (sender === getUserId()) return;
  await deleteMessage(roomCode, message.id);
}

// ── Typing — rooms/{code}/typing ────────────────────────────────────────────

export function setTyping(roomCode: string, active: boolean): void {
  const uid = getUserId();
  const code = normalizeRoomCode(roomCode);
  const tRef = ref(getDb(), `${roomPath(code)}/typing/${uid}`);
  if (active) void set(tRef, { active: true, updatedAt: serverTimestamp() });
  else void remove(tRef);
}

export function listenTyping(
  roomCode: string,
  onTyping: (userIds: string[]) => void,
): Unsubscribe {
  return subscribeTyping(roomCode, onTyping);
}

export function subscribeTyping(
  roomCode: string,
  onTyping: (userIds: string[]) => void,
): Unsubscribe {
  const uid = getUserId();
  const code = normalizeRoomCode(roomCode);
  return onValue(typingRef(code), (snap) => {
    const data = snap.val() as Record<string, { active?: boolean }> | null;
    if (!data) { onTyping([]); return; }
    onTyping(
      Object.entries(data)
        .filter(([id, v]) => id !== uid && v?.active)
        .map(([id]) => id),
    );
  });
}

let typingClearTimer: ReturnType<typeof setTimeout> | null = null;

export function signalTyping(roomCode: string): void {
  setTyping(roomCode, true);
  if (typingClearTimer) clearTimeout(typingClearTimer);
  typingClearTimer = setTimeout(() => setTyping(roomCode, false), 3000);
}

// ── Presence — rooms/{code}/userMeta ──────────────────────────────────────

export function setupPresence(roomCode: string): () => void {
  const code = normalizeRoomCode(roomCode);
  void setUserOnline(code, true);
  const connectedRef = ref(getDb(), ".info/connected");
  const unsub = onValue(connectedRef, (snap) => {
    if (snap.val() === true) void setUserOnline(code, true);
  });
  const heartbeat = window.setInterval(() => void setUserOnline(code, true), 30_000);
  return () => {
    unsub();
    clearInterval(heartbeat);
    void setUserOnline(code, false);
  };
}

export interface PresenceState {
  userId: string;
  online: boolean;
  lastSeen: number;
}

export function subscribePresence(
  roomCode: string,
  onPresence: (states: PresenceState[]) => void,
): Unsubscribe {
  const uid = getUserId();
  const code = normalizeRoomCode(roomCode);
  return onValue(presenceRef(code), (snap) => {
    const data = snap.val() as Record<
      string,
      { online?: boolean; lastSeen?: number | { seconds?: number } }
    > | null;
    if (!data) { onPresence([]); return; }
    onPresence(
      Object.entries(data)
        .filter(([id]) => id !== uid)
        .map(([userId, v]) => ({
          userId,
          online: Boolean(v.online),
          lastSeen:
            typeof v.lastSeen === "number"
              ? v.lastSeen
              : v.lastSeen?.seconds
                ? v.lastSeen.seconds * 1000
                : Date.now(),
        })),
    );
  });
}

export { uploadFile, uploadFileWithRetry, detectMessageType } from "@/services/uploadService";
export type { UploadResult, UploadProgress } from "@/services/uploadService";
