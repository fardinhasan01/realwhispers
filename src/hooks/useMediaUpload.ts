import { useCallback, useRef, useState } from "react";
import {
  uploadFileWithRetry,
  detectMessageType,
  type UploadProgress,
  type UploadResult,
} from "@/services/uploadService";

export type UploadStatus = "idle" | "uploading" | "success" | "error" | "cancelled";

export interface PendingUpload {
  id: string;
  file: File;
  fileName: string;
  type: ReturnType<typeof detectMessageType>;
  progress: UploadProgress;
  status: UploadStatus;
  error?: string;
}

export function useMediaUpload(roomCode: string | null) {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const updateUpload = useCallback((id: string, patch: Partial<PendingUpload>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
    abortControllers.current.delete(id);
  }, []);

  const upload = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      if (!roomCode) return null;

      const id = crypto.randomUUID();
      const controller = new AbortController();
      abortControllers.current.set(id, controller);

      const pending: PendingUpload = {
        id,
        file,
        fileName: file.name,
        type: detectMessageType(file),
        progress: { loaded: 0, total: file.size, percent: 0 },
        status: "uploading",
      };
      setUploads((prev) => [...prev, pending]);

      try {
        const result = await uploadFileWithRetry({
          roomCode,
          file,
          signal: controller.signal,
          onProgress: (progress) => updateUpload(id, { progress }),
        });
        updateUpload(id, { status: "success", progress: { ...pending.progress, percent: 100 } });
        setTimeout(() => removeUpload(id), 1500);
        return result;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateUpload(id, { status: "cancelled" });
          setTimeout(() => removeUpload(id), 800);
          return null;
        }
        const message = err instanceof Error ? err.message : "Upload failed";
        updateUpload(id, { status: "error", error: message });
        return null;
      }
    },
    [roomCode, removeUpload, updateUpload],
  );

  const cancel = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
  }, []);

  const retry = useCallback(
    async (id: string): Promise<UploadResult | null> => {
      const item = uploads.find((u) => u.id === id);
      if (!item || !roomCode) return null;
      removeUpload(id);
      return upload(item.file);
    },
    [upload, uploads, roomCode, removeUpload],
  );

  const isUploading = uploads.some((u) => u.status === "uploading");

  return { uploads, upload, cancel, retry, isUploading };
}
