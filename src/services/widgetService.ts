import {
  getDb,
  ref,
  set,
  update,
  onValue,
  serverTimestamp,
} from "@/lib/firebase";
import type { Unsubscribe } from "firebase/database";
import { getUserId, initUserId } from "@/lib/user-id";
import { ensureAuth } from "@/lib/firebase";
import { normalizeRoomCode } from "@/lib/room-code";

async function ensureReady() {
  await ensureAuth();
  await initUserId();
}

export interface CoupleWidget {
  theme: string;
  note: string;
  doodle: string;
  hearts: number;
  mood: string;
  thinkingOfYou: boolean;
  countdownTarget: number | null;
  lastEmoji: string;
  updatedBy: string;
  updatedAt: number;
}

export const defaultWidget = (): CoupleWidget => ({
  theme: "rose",
  note: "",
  doodle: "",
  hearts: 0,
  mood: "💜",
  thinkingOfYou: false,
  countdownTarget: null,
  lastEmoji: "",
  updatedBy: "",
  updatedAt: Date.now(),
});

function widgetRef(roomCode: string) {
  return ref(getDb(), `rooms/${normalizeRoomCode(roomCode)}/widget`);
}

function parseWidget(data: unknown): CoupleWidget {
  if (!data || typeof data !== "object") return defaultWidget();
  const w = data as CoupleWidget;
  return {
    theme: w.theme ?? "rose",
    note: w.note ?? "",
    doodle: w.doodle ?? "",
    hearts: w.hearts ?? 0,
    mood: w.mood ?? "💜",
    thinkingOfYou: Boolean(w.thinkingOfYou),
    countdownTarget: w.countdownTarget ?? null,
    lastEmoji: w.lastEmoji ?? "",
    updatedBy: w.updatedBy ?? "",
    updatedAt:
      typeof w.updatedAt === "number"
        ? w.updatedAt
        : (w.updatedAt as { seconds?: number })?.seconds
          ? (w.updatedAt as { seconds: number }).seconds * 1000
          : Date.now(),
  };
}

export function subscribeWidget(
  roomCode: string,
  onData: (widget: CoupleWidget) => void,
): Unsubscribe {
  const code = normalizeRoomCode(roomCode);
  console.log("[WhisperLock] subscribeWidget", { path: `rooms/${code}/widget` });
  return onValue(widgetRef(code), (snap) => {
    onData(parseWidget(snap.val()));
  });
}

export async function syncWidget(
  roomCode: string,
  patch: Partial<CoupleWidget>,
): Promise<void> {
  await ensureReady();
  const uid = getUserId();
  const code = normalizeRoomCode(roomCode);
  await update(widgetRef(code), {
    ...patch,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

export async function sendWidgetHeart(roomCode: string): Promise<void> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const uid = getUserId();
  const snap = await import("firebase/database").then(({ get }) => get(widgetRef(code)));
  const current = snap.exists() ? (snap.val() as CoupleWidget).hearts ?? 0 : 0;
  await update(widgetRef(code), {
    hearts: current + 1,
    lastEmoji: "❤️",
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

export async function tapThinkingOfYou(roomCode: string): Promise<void> {
  await syncWidget(roomCode, { thinkingOfYou: true, lastEmoji: "🥺" });
  window.setTimeout(() => {
    void syncWidget(roomCode, { thinkingOfYou: false });
  }, 8000);
}

export async function initWidgetIfMissing(roomCode: string): Promise<void> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  await set(widgetRef(code), {
    ...defaultWidget(),
    updatedAt: serverTimestamp(),
  });
}
