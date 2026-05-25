import { get, child, runTransaction } from "firebase/database";
import {
  getDb,
  ref,
  set,
  update,
  serverTimestamp,
  remove,
  onDisconnect,
} from "@/lib/firebase";
import { getUserId, initUserId } from "@/lib/user-id";
import { ensureAuth } from "@/lib/firebase";
import { normalizeRoomCode } from "@/lib/room-code";
import { createInvite, type RoomInvite } from "@/services/qrService";
import { defaultWidget } from "@/services/widgetService";
import type { DisappearMode } from "@/lib/whisper-store";

async function ensureReady() {
  await ensureAuth();
  await initUserId();
}

export interface FirebaseRoom {
  roomCode: string;
  createdAt: number | object | null;
  users: Record<string, boolean>;
  messages?: Record<string, unknown> | null;
  invite?: RoomInvite;
  members?: Record<string, boolean>;
  mood?: string;
  theme?: "rose" | "violet" | "cyan" | "aurora";
  disappear?: DisappearMode;
  nicknames?: Record<string, string>;
  pinnedMessageId?: string | null;
}

export interface UserMeta {
  online?: boolean;
  lastSeen?: number | object;
  unread?: number;
  lastReadAt?: number;
}

export interface LocalRoomMeta {
  id: string;
  joinedAt: number;
  partnerNickname: string;
  myNickname: string;
  mood?: string;
  theme?: "rose" | "violet" | "cyan" | "aurora";
  disappear?: DisappearMode;
}

const MAX_USERS = 2;

function roomRef(roomCode: string) {
  return ref(getDb(), `rooms/${normalizeRoomCode(roomCode)}`);
}

export function getUsers(room: FirebaseRoom): Record<string, boolean> {
  if (room.users && Object.keys(room.users).length > 0) return room.users;
  return room.members ?? {};
}

export function userCount(room: FirebaseRoom): number {
  return Object.keys(getUsers(room)).filter((k) => getUsers(room)[k]).length;
}

export async function roomExists(roomCode: string): Promise<boolean> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const snap = await get(roomRef(code));
  const exists = snap.exists();
  console.log("[WhisperLock] roomExists", { code, exists });
  return exists;
}

export async function getRoom(roomCode: string): Promise<FirebaseRoom | null> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const snap = await get(roomRef(code));
  if (!snap.exists()) return null;
  const data = snap.val() as FirebaseRoom;
  return { ...data, roomCode: code, users: getUsers(data) };
}

export async function createRoom(
  roomCode: string,
  meta?: Partial<LocalRoomMeta>,
): Promise<{ ok: true; room: FirebaseRoom; invite: RoomInvite } | { ok: false; error: string }> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const uid = getUserId();

  if (!code || code.length < 6) {
    return { ok: false, error: "Invalid room code" };
  }

  const existing = await get(roomRef(code));
  if (existing.exists()) {
    return { ok: false, error: "Room code already taken" };
  }

  const invite = createInvite();
  const widget = defaultWidget();

  const roomData = {
    roomCode: code,
    createdAt: serverTimestamp(),
    users: { [uid]: true },
    messages: {},
    typing: {},
    reactions: {},
    widget: { ...widget, updatedAt: serverTimestamp() },
    invite,
    mood: meta?.mood ?? "💜",
    theme: meta?.theme ?? "rose",
    disappear: meta?.disappear ?? "off",
    nicknames: { [uid]: meta?.myNickname ?? "Me" },
    userMeta: {
      [uid]: { online: true, lastSeen: serverTimestamp(), unread: 0, lastReadAt: Date.now() },
    },
  };

  try {
    await set(roomRef(code), roomData);
    console.log("[WhisperLock] createRoom — saved", { code, uid, invite });

    const verify = await get(roomRef(code));
    if (!verify.exists()) {
      return { ok: false, error: "Room could not be saved. Deploy Firebase rules & enable Anonymous Auth." };
    }

    const saved = verify.val() as FirebaseRoom;
    return {
      ok: true,
      room: { ...saved, roomCode: code, users: getUsers(saved) },
      invite,
    };
  } catch (err) {
    console.error("[WhisperLock] createRoom — error", err);
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create room" };
  }
}

export async function joinRoom(
  roomCode: string,
  meta?: Partial<LocalRoomMeta>,
): Promise<
  | { ok: true; room: FirebaseRoom }
  | { ok: false; error: "not_found" | "full" | "already_member" }
> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const uid = getUserId();

  console.log("[WhisperLock] joinRoom — query", { code, uid });

  const snap = await get(roomRef(code));
  console.log("[WhisperLock] joinRoom — result", { code, exists: snap.exists() });

  if (!snap.exists()) return { ok: false, error: "not_found" };

  const room = snap.val() as FirebaseRoom;
  const users = getUsers(room);

  if (users[uid]) {
    await setUserOnline(code, true);
    return { ok: true, room: { ...room, roomCode: code, users } };
  }

  if (Object.keys(users).filter((k) => users[k]).length >= MAX_USERS) {
    return { ok: false, error: "full" };
  }

  try {
    const patch: Record<string, unknown> = {
      [`users/${uid}`]: true,
      [`userMeta/${uid}`]: {
        online: true,
        lastSeen: serverTimestamp(),
        unread: 0,
        lastReadAt: Date.now(),
      },
    };
    if (meta?.myNickname) patch[`nicknames/${uid}`] = meta.myNickname;

    await update(roomRef(code), patch);
    console.log("[WhisperLock] joinRoom — joined", { code, uid });

    const updated = await get(roomRef(code));
    const joined = updated.val() as FirebaseRoom;
    return { ok: true, room: { ...joined, roomCode: code, users: getUsers(joined) } };
  } catch (err) {
    console.error("[WhisperLock] joinRoom — failed", err);
    return { ok: false, error: "not_found" };
  }
}

export async function setUserOnline(roomCode: string, online: boolean): Promise<void> {
  await ensureReady();
  const uid = getUserId();
  const code = normalizeRoomCode(roomCode);
  const metaRef = ref(getDb(), `rooms/${code}/userMeta/${uid}`);
  await update(metaRef, { online, lastSeen: serverTimestamp() });
  if (online) {
    void onDisconnect(metaRef).update({ online: false, lastSeen: serverTimestamp() });
  }
}

export async function incrementPartnerUnread(roomCode: string, senderId: string): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  const snap = await get(ref(getDb(), `rooms/${code}/users`));
  if (!snap.exists()) return;
  const users = snap.val() as Record<string, boolean>;
  for (const uid of Object.keys(users)) {
    if (uid !== senderId && users[uid]) {
      const metaRef = ref(getDb(), `rooms/${code}/userMeta/${uid}/unread`);
      await runTransaction(metaRef, (cur) => (cur ?? 0) + 1);
    }
  }
}

export async function clearUnread(roomCode: string): Promise<void> {
  await ensureReady();
  const uid = getUserId();
  const code = normalizeRoomCode(roomCode);
  await update(ref(getDb(), `rooms/${code}/userMeta/${uid}`), {
    unread: 0,
    lastReadAt: Date.now(),
  });
}

export async function updateRoomMeta(
  roomCode: string,
  patch: Partial<Pick<FirebaseRoom, "mood" | "theme" | "disappear" | "pinnedMessageId">>,
): Promise<void> {
  await ensureReady();
  await update(roomRef(roomCode), patch);
}

export async function setNickname(roomCode: string, nickname: string): Promise<void> {
  await ensureReady();
  const uid = getUserId();
  await update(roomRef(roomCode), { [`nicknames/${uid}`]: nickname });
}

export function getPartnerId(room: FirebaseRoom): string | null {
  const uid = getUserId();
  const users = getUsers(room);
  return Object.keys(users).find((k) => users[k] && k !== uid) ?? null;
}

export function getPartnerNickname(room: FirebaseRoom): string {
  const partnerId = getPartnerId(room);
  if (partnerId && room.nicknames?.[partnerId]) return room.nicknames[partnerId];
  return "Partner";
}

export async function leaveRoom(roomCode: string): Promise<void> {
  await ensureReady();
  const uid = getUserId();
  const code = normalizeRoomCode(roomCode);
  await remove(ref(getDb(), `rooms/${code}/users/${uid}`));
  await setUserOnline(code, false);
}

export async function burnRoomMessages(roomCode: string): Promise<void> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  await set(ref(getDb(), `rooms/${code}/messages`), {});
}

export async function deleteRoomData(roomCode: string): Promise<void> {
  await ensureReady();
  const code = normalizeRoomCode(roomCode);
  const uid = getUserId();
  console.log("[WhisperLock] deleteRoomData", { code, uid });
  await remove(ref(getDb(), `rooms/${code}/users/${uid}`));
  await setUserOnline(code, false);
  const usersSnap = await get(ref(getDb(), `rooms/${code}/users`));
  const users = usersSnap.val() as Record<string, boolean> | null;
  const active = users
    ? Object.keys(users).filter((k) => users[k]).length
    : 0;
  if (active === 0) {
    await remove(roomRef(code));
    console.log("[WhisperLock] deleteRoomData — removed empty room node", { code });
  }
}

export async function isRoomMember(roomCode: string): Promise<boolean> {
  await ensureReady();
  const uid = getUserId();
  const code = normalizeRoomCode(roomCode);
  const snap = await get(ref(getDb(), `rooms/${code}/users/${uid}`));
  return snap.val() === true;
}
