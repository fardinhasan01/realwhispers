import { ensureAuth, getAuthInstance } from "@/lib/firebase";
import { normalizeRoomCode } from "@/lib/room-code";

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

const UPLOAD_URL =
  import.meta.env.VITE_UPLOAD_API_URL?.replace(/\/$/, "") ?? "/api";

async function getIdToken(): Promise<string> {
  await ensureAuth();
  const user = getAuthInstance().currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.getIdToken();
}

export function detectMessageType(file: File): UploadMessageType {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
  const { roomCode, file, onProgress, signal } = options;
  const token = await getIdToken();
  const code = normalizeRoomCode(roomCode);

  const form = new FormData();
  form.append("file", file, file.name);
  form.append("roomCode", code);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${UPLOAD_URL}/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

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
        const body = JSON.parse(xhr.responseText) as UploadResult & { error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && body.url) {
          resolve(body);
          return;
        }
        reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
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
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
  throw lastError ?? new Error("Upload failed");
}
