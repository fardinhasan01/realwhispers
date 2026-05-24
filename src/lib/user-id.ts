import { getAuthInstance, ensureAuth } from "@/lib/firebase";

const LEGACY_KEY = "wl:user-id";

const isBrowser = () => typeof window !== "undefined";

export async function initUserId(): Promise<string> {
  if (!isBrowser()) return "ssr";
  await ensureAuth();
  const auth = getAuthInstance();
  if (auth.currentUser?.uid) {
    localStorage.setItem(LEGACY_KEY, auth.currentUser.uid);
    return auth.currentUser.uid;
  }
  let id = localStorage.getItem(LEGACY_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `u_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(LEGACY_KEY, id);
  }
  return id;
}

export function getUserId(): string {
  if (!isBrowser()) return "ssr";
  try {
    const auth = getAuthInstance();
    if (auth.currentUser?.uid) return auth.currentUser.uid;
  } catch {
    // auth not initialized yet
  }
  return (
    localStorage.getItem(LEGACY_KEY) ??
    `u_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

export function clearUserId() {
  if (isBrowser()) localStorage.removeItem(LEGACY_KEY);
}
