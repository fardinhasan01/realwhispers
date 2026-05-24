export type MediaMessageType = "image" | "file" | "audio" | "video";

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-m4a",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/3gpp",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const MAX_BYTES: Record<MediaMessageType, number> = {
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  file: 25 * 1024 * 1024,
};

export function inferMessageType(mime: string): MediaMessageType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\.\./g, "_");
  const trimmed = base.trim().slice(0, 120);
  return trimmed || "file";
}
