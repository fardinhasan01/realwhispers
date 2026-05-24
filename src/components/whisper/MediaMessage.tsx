import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, FileText, Film, Play, X, ZoomIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/services/chatService";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

function mediaUrl(msg: ChatMessage): string | undefined {
  return msg.fileUrl ?? msg.mediaUrl;
}

function displayName(msg: ChatMessage): string {
  return msg.fileName ?? msg.text ?? "File";
}

export function MediaMessageContent({ msg, me }: { msg: ChatMessage; me: boolean }) {
  const url = mediaUrl(msg);
  const [zoomOpen, setZoomOpen] = useState(false);

  if (!url) return <span className="text-muted-foreground italic">Media unavailable</span>;

  switch (msg.type) {
    case "image":
      return (
        <>
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="group relative block overflow-hidden rounded-2xl"
          >
            <img
              src={url}
              alt={displayName(msg)}
              className="max-h-56 max-w-full object-cover transition group-hover:scale-[1.02]"
              loading="lazy"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100">
              <ZoomIn className="h-8 w-8 text-white drop-shadow" />
            </span>
          </button>
          <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
            <DialogContent className="max-w-[95vw] border-none bg-transparent p-0 shadow-none">
              <img
                src={url}
                alt={displayName(msg)}
                className="max-h-[85vh] w-full rounded-2xl object-contain"
              />
            </DialogContent>
          </Dialog>
        </>
      );

    case "video":
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative overflow-hidden rounded-2xl"
        >
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className="max-h-56 max-w-full rounded-2xl bg-black/40"
          />
          <motion.div className={cn(
            "pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
            me ? "bg-white/20 text-white" : "bg-black/40 text-white",
          )}>
            <Film className="h-3 w-3" /> Video
          </motion.div>
        </motion.div>
      );

    case "audio":
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn(
            "flex min-w-[200px] items-center gap-2 rounded-2xl p-1",
            me ? "bg-white/10" : "bg-black/10",
          )}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <Play className="h-4 w-4" />
          </span>
          <audio src={url} controls className="h-9 max-w-[180px] flex-1" />
        </motion.div>
      );

    case "file":
    default:
      return (
        <a
          href={url}
          download={displayName(msg)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-white/10",
            me ? "text-white" : "text-foreground",
          )}
        >
          <span className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            me ? "bg-white/15" : "bg-white/10",
          )}>
            <FileText className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{displayName(msg)}</span>
            <span className="text-[10px] opacity-70">Tap to download</span>
          </span>
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </a>
      );
  }
}

export function UploadProgressBar({
  fileName,
  percent,
  onCancel,
  onRetry,
  status,
  error,
}: {
  fileName: string;
  percent: number;
  status: "uploading" | "error" | "success" | "cancelled";
  error?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="glass mx-3 mb-2 rounded-2xl px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{fileName}</p>
            {status === "uploading" && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-romance"
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ ease: "easeOut" }}
                />
              </div>
            )}
            {status === "error" && (
              <p className="mt-0.5 text-[10px] text-destructive">{error ?? "Upload failed"}</p>
            )}
            {status === "success" && (
              <p className="mt-0.5 text-[10px] text-emerald-400">Sent ✓</p>
            )}
          </div>
          {status === "uploading" && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Cancel upload"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {status === "error" && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full bg-gradient-romance px-3 py-1 text-[10px] font-medium text-white"
            >
              Retry
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
