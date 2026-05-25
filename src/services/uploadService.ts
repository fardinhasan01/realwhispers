import { ensureAuth } from "@/lib/firebase";
import {
  getCloudinaryConfig,
  getCloudinaryUploadUrl,
  type CloudinaryResourceType,
} from "@/lib/cloudinary";
import { normalizeRoomCode } from "@/lib/room-code";
import { isRoomMember } from "@/services/roomService";

export type UploadMessageType = "image" | "file" | "audio" | "video";

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadResult {
  url: string;
  fileName: string;
  type: UploadMessageType;
  bytes: number;
  mime: string;
}

export interface UploadOptions {
  roomCode: string;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

interface CloudinaryUploadResponse {
  secure_url: string;
  bytes: number;
  original_filename?: string;
  resource_type?: string;
  error?: { message: string };
}

const MAX_BYTES: Record<UploadMessageType, number> = {
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  file: 25 * 1024 * 1024,
};

const ALLOWED_PREFIXES = ["image/", "audio/", "video/", "application/", "text/"];

export function detectMessageType(file: File): UploadMessageType {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function resourceTypeForUpload(type: UploadMessageType): CloudinaryResourceType {
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (type === "audio" || type === "file") return "raw";
  return "auto";
}

function validateFile(file: File): UploadMessageType {
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const msgType = detectMessageType(file);

  if (!ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) {
    throw new Error(`File type not allowed: ${mime || "unknown"}`);
  }

  const max = MAX_BYTES[msgType];
  if (file.size > max) {
    throw new Error(
      `File too large (${Math.round(file.size / 1024 / 1024)}MB). Max ${Math.round(max / 1024 / 1024)}MB for ${msgType}.`,
    );
  }

  return msgType;
}

export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
  const { roomCode, file, onProgress, signal } = options;
  const code = normalizeRoomCode(roomCode);

  await ensureAuth();
  const member = await isRoomMember(code);
  if (!member) {
    console.error("[WhisperLock] upload — rejected, not a room member", { code });
    throw new Error("Join this room before sending media");
  }

  const msgType = validateFile(file);
  const { uploadPreset } = getCloudinaryConfig();
  const uploadUrl = getCloudinaryUploadUrl(resourceTypeForUpload(msgType));

  const form = new FormData();
  form.append("file", file, file.name);
  form.append("upload_preset", uploadPreset);
  form.append("folder", `whisperlock/${code}`);

  console.log("[WhisperLock] upload — start", {
    code,
    msgType,
    name: file.name,
    size: file.size,
    mime: file.type,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: Math.round((e.loaded / e.total) * 100),
      });
    };

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as CloudinaryUploadResponse;
        if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) {
          console.log("[WhisperLock] upload — success", {
            code,
            url: body.secure_url,
            bytes: body.bytes,
          });
          resolve({
            url: body.secure_url,
            fileName: body.original_filename ?? file.name,
            type: msgType,
            bytes: body.bytes ?? file.size,
            mime: file.type || "application/octet-stream",
          });
          return;
        }
        const errMsg =
          body.error?.message ??
          `Cloudinary upload failed (${xhr.status}). Check upload preset is unsigned.`;
        console.error("[WhisperLock] upload — failed", { status: xhr.status, body });
        reject(new Error(errMsg));
      } catch {
        console.error("[WhisperLock] upload — bad response", xhr.responseText);
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      console.error("[WhisperLock] upload — network error");
      reject(new Error("Network error — check internet connection"));
    };
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Upload cancelled", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}

export async function uploadFileWithRetry(
  options: UploadOptions,
  maxAttempts = 3,
): Promise<UploadResult> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options.signal?.aborted) {
      throw new DOMException("Upload cancelled", "AbortError");
    }
    try {
      return await uploadFile(options);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastError = err instanceof Error ? err : new Error("Upload failed");
      console.warn("[WhisperLock] upload — retry", { attempt, error: lastError.message });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
  }
  throw lastError ?? new Error("Upload failed");
}
