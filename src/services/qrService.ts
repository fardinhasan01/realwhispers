import QRCode from "qrcode";
import { get } from "firebase/database";
import { getDb, ref } from "@/lib/firebase";
import { normalizeRoomCode } from "@/lib/room-code";
import { joinRoom, type FirebaseRoom } from "@/services/roomService";

const QR_VERSION = 1;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export interface QRPayload {
  v: number;
  code: string;
  token: string;
  t: number;
}

export interface RoomInvite {
  token: string;
  expiresAt: number;
}

export function buildQRPayload(
  roomCode: string,
  invite: RoomInvite,
): QRPayload {
  return {
    v: QR_VERSION,
    code: normalizeRoomCode(roomCode),
    token: invite.token,
    t: invite.expiresAt,
  };
}

export function encodeQRPayload(payload: QRPayload): string {
  return `whisperlock://join?${new URLSearchParams({
    v: String(payload.v),
    code: payload.code,
    token: payload.token,
    t: String(payload.t),
  }).toString()}`;
}

export function parseQRPayload(raw: string): QRPayload | null {
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith("whisperlock://")) {
      const url = new URL(trimmed);
      const code = url.searchParams.get("code");
      const token = url.searchParams.get("token");
      const t = url.searchParams.get("t");
      if (!code || !token || !t) return null;
      return {
        v: Number(url.searchParams.get("v") ?? 1),
        code: normalizeRoomCode(code),
        token,
        t: Number(t),
      };
    }
    const json = JSON.parse(trimmed) as QRPayload;
    if (json.code && json.token) {
      return {
        v: json.v ?? 1,
        code: normalizeRoomCode(json.code),
        token: json.token,
        t: Number(json.t),
      };
    }
  } catch {
    // try plain room code fallback
    if (/^[A-Z]+-[A-Z0-9]+-[A-Z]+$/.test(normalizeRoomCode(trimmed))) {
      return {
        v: QR_VERSION,
        code: normalizeRoomCode(trimmed),
        token: "",
        t: Date.now() + INVITE_TTL_MS,
      };
    }
  }
  return null;
}

export function createInvite(): RoomInvite {
  const token =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `inv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    token,
    expiresAt: Date.now() + INVITE_TTL_MS,
  };
}

export async function generateQRCode(
  roomCode: string,
  invite: RoomInvite,
): Promise<string> {
  const payload = buildQRPayload(roomCode, invite);
  const text = encodeQRPayload(payload);
  return QRCode.toDataURL(text, {
    width: 280,
    margin: 2,
    color: { dark: "#ff4dcd", light: "#0a000f" },
  });
}

export async function validateInvite(
  roomCode: string,
  token: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "invalid" | "expired" }> {
  const code = normalizeRoomCode(roomCode);
  const snap = await get(ref(getDb(), `rooms/${code}/invite`));
  if (!snap.exists()) {
    console.log("[WhisperLock] validateInvite — no invite on room", { code });
    return { ok: false, reason: "not_found" };
  }
  const invite = snap.val() as RoomInvite;
  if (invite.token !== token) {
    console.warn("[WhisperLock] validateInvite — token mismatch", { code });
    return { ok: false, reason: "invalid" };
  }
  if (Date.now() > invite.expiresAt) {
    console.warn("[WhisperLock] validateInvite — expired", { code });
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export async function joinViaQR(
  rawPayload: string,
): Promise<
  | { ok: true; room: FirebaseRoom; code: string }
  | { ok: false; error: "invalid_qr" | "not_found" | "expired" | "full" }
> {
  const payload = parseQRPayload(rawPayload);
  console.log("[WhisperLock] joinViaQR — parsed", payload);
  if (!payload) return { ok: false, error: "invalid_qr" };

  if (payload.token) {
    const valid = await validateInvite(payload.code, payload.token);
    if (!valid.ok) {
      if (valid.reason === "expired") return { ok: false, error: "expired" };
      if (valid.reason === "not_found") return { ok: false, error: "not_found" };
      return { ok: false, error: "invalid_qr" };
    }
  }

  const result = await joinRoom(payload.code, { myNickname: "Me" });
  console.log("[WhisperLock] joinViaQR — join result", result);
  if (!result.ok) {
    if (result.error === "full") return { ok: false, error: "full" };
    return { ok: false, error: "not_found" };
  }
  return { ok: true, room: result.room, code: payload.code };
}
