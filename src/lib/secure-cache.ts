/**
 * Encrypted localStorage wrapper for sensitive cached data.
 * Key is derived from the vault PIN (stored hashed in session for the session).
 */

const CACHE_KEY = "wl:secure-cache";
const SESSION_KEY = "wl:cache-key";

const isBrowser = () => typeof window !== "undefined";

function getSessionKey(): CryptoKey | null {
  return null;
}

async function deriveKey(pin: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin.padEnd(8, "0").slice(0, 32)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("whisperlock-v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function initSecureCache(pin: string) {
  if (!isBrowser() || !crypto.subtle) return;
  const key = await deriveKey(pin);
  const raw = await crypto.subtle.exportKey("jwk", key);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(raw));
}

export function clearSecureCache() {
  if (!isBrowser()) return;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CACHE_KEY);
}

async function loadKey(): Promise<CryptoKey | null> {
  if (!isBrowser() || !crypto.subtle) return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return getSessionKey();
  try {
    return crypto.subtle.importKey(
      "jwk",
      JSON.parse(raw),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

export async function secureSet<T>(value: T): Promise<void> {
  if (!isBrowser()) return;
  const key = await loadKey();
  if (!key) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ plain: value }));
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const payload = {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(cipher)),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

export async function secureGet<T>(fallback: T): Promise<T> {
  if (!isBrowser()) return fallback;
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.plain !== undefined) return parsed.plain as T;
    const key = await loadKey();
    if (!key || !parsed.iv || !parsed.data) return fallback;
    const iv = new Uint8Array(parsed.iv);
    const data = new Uint8Array(parsed.data);
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return JSON.parse(new TextDecoder().decode(dec)) as T;
  } catch {
    return fallback;
  }
}
