// Local settings + encrypted cache for room metadata.
// Messages and rooms sync via Firebase Realtime Database.

export type DisappearMode = "off" | "5s" | "30s" | "1m" | "after-seen" | "1h";

export interface Room {
  id: string;
  createdAt: number;
  partnerNickname: string;
  myNickname: string;
  anniversary?: number;
  mood?: string;
  theme: "rose" | "violet" | "cyan" | "aurora";
  disappear: DisappearMode;
}

export interface Settings {
  pin: string;
  fakePin?: string;
  biometric: boolean;
  autoLockMinutes: number;
  hideNotifications: boolean;
  blurMultitasking: boolean;
  panicWipeOnFail: number;
}

const KEYS = {
  settings: "wl:settings",
  rooms: "wl:rooms",
  activeRoom: "wl:active-room",
  unlocked: "wl:unlocked",
  fakeMode: "wl:fake-mode",
};

const isBrowser = () => typeof window !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const defaultSettings: Settings = {
  pin: "",
  biometric: false,
  autoLockMinutes: 5,
  hideNotifications: true,
  blurMultitasking: true,
  panicWipeOnFail: 8,
};

export const getSettings = (): Settings =>
  read<Settings>(KEYS.settings, defaultSettings);

export const saveSettings = (s: Settings) => write(KEYS.settings, s);

export const isOnboarded = () => Boolean(getSettings().pin);

export const setUnlocked = (v: boolean, fake = false) => {
  if (!isBrowser()) return;
  if (v) {
    sessionStorage.setItem(KEYS.unlocked, "1");
    sessionStorage.setItem(KEYS.fakeMode, fake ? "1" : "0");
  } else {
    sessionStorage.removeItem(KEYS.unlocked);
    sessionStorage.removeItem(KEYS.fakeMode);
  }
};

export const isUnlocked = () =>
  isBrowser() && sessionStorage.getItem(KEYS.unlocked) === "1";

export const isFakeMode = () =>
  isBrowser() && sessionStorage.getItem(KEYS.fakeMode) === "1";

const WORDS_A = [
  "MOON", "STAR", "ROSE", "DUSK", "NEON", "AURA", "ECHO", "VEIL", "WISP", "HALO",
];
const WORDS_B = [
  "LOVE", "KISS", "GLOW", "FIRE", "DREAM", "PULSE", "SOUL", "BLISS", "HONEY", "VOID",
];

export function generateRoomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)];
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)];
  const n = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${a}-${n}-${b}`.toUpperCase();
}

export const getRooms = (): Room[] => read<Room[]>(KEYS.rooms, []);

export const saveRooms = (rooms: Room[]) => write(KEYS.rooms, rooms);

export function cacheRoom(room: Room) {
  const rooms = getRooms().filter((r) => r.id !== room.id);
  rooms.unshift(room);
  saveRooms(rooms);
}

export function removeCachedRoom(id: string) {
  saveRooms(getRooms().filter((r) => r.id !== id));
}

export const updateRoom = (id: string, patch: Partial<Room>) => {
  const rooms = getRooms().map((r) => (r.id === id ? { ...r, ...patch } : r));
  saveRooms(rooms);
};

export const deleteRoom = (id: string) => {
  removeCachedRoom(id);
  if (getActiveRoomId() === id) setActiveRoom(null);
};

export const getActiveRoomId = () =>
  isBrowser() ? localStorage.getItem(KEYS.activeRoom) : null;

export const setActiveRoom = (id: string | null) => {
  if (!isBrowser()) return;
  if (id) localStorage.setItem(KEYS.activeRoom, id);
  else localStorage.removeItem(KEYS.activeRoom);
};

export const panicWipe = () => {
  if (!isBrowser()) return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith("wl:"))
    .forEach((k) => localStorage.removeItem(k));
  sessionStorage.clear();
  void import("@/lib/secure-cache").then((m) => m.clearSecureCache());
  void import("@/lib/user-id").then((m) => m.clearUserId());
};

export function disappearMs(mode: DisappearMode): number | undefined {
  switch (mode) {
    case "5s":
      return 5_000;
    case "30s":
      return 30_000;
    case "1m":
      return 60_000;
    case "1h":
      return 3_600_000;
    default:
      return undefined;
  }
}
