import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Flame, Image as ImageIcon, Mic, Plus, Send,
  Smile, Timer, Shield, Heart, Reply, X, Phone, Video, LayoutGrid,
  Paperclip, Film, MoreVertical, Camera,
} from "lucide-react";
import {
  isFakeMode, isOnboarded, isUnlocked, updateRoom, setActiveRoom,
  type DisappearMode,
} from "@/lib/whisper-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Particles } from "@/components/whisper/Particles";
import { useRoom } from "@/hooks/useRoom";
import { useMessages, isMe } from "@/hooks/useMessages";
import { usePresence } from "@/hooks/usePresence";
import { updateRoomMeta, burnRoomMessages, leaveRoom, deleteRoomData, joinRoom } from "@/services/roomService";
import { deleteRoom } from "@/lib/whisper-store";
import type { ChatMessage } from "@/services/chatService";
import { normalizeRoomCode } from "@/lib/room-code";
import { useCall } from "@/hooks/useCall";
import { CallOverlay } from "@/components/whisper/CallOverlay";
import { MediaMessageContent, UploadProgressBar } from "@/components/whisper/MediaMessage";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { VoiceNoteRecorder } from "@/components/whisper/VoiceNoteRecorder";
import { RoomMenu } from "@/components/whisper/RoomMenu";
import { haptic } from "@/lib/haptics";

export const Route = createFileRoute("/chat/$roomId")({
  component: Chat,
});

const REACTIONS = ["❤️", "😂", "😘", "😭", "🥺", "🔥", "🌙", "✨"];
const TIMER_OPTS: { v: DisappearMode; label: string }[] = [
  { v: "off", label: "Off" },
  { v: "5s", label: "5s" },
  { v: "30s", label: "30s" },
  { v: "1m", label: "1 min" },
  { v: "1h", label: "1 hr" },
  { v: "after-seen", label: "After seen" },
];

function Chat() {
  const { roomId: rawRoomId } = Route.useParams();
  const roomId = normalizeRoomCode(rawRoomId);
  const nav = useNavigate();
  const { room, loading: roomLoading } = useRoom(roomId);
  const {
    messages,
    isPartnerTyping,
    send,
    markSeen,
    react,
    onDraftChange,
  } = useMessages(roomId, room?.disappear ?? "off");
  const { statusLabel, isOnline } = usePresence(roomId);
  const call = useCall(roomId);
  const mediaUpload = useMediaUpload(roomId);
  const voice = useVoiceRecorder();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reactingFor, setReactingFor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fake = isFakeMode();

  useEffect(() => {
    if (!isOnboarded()) { nav({ to: "/onboard" }); return; }
    if (!isUnlocked()) { nav({ to: "/lock" }); return; }
    setActiveRoom(roomId);
    void markSeen();
  }, [roomId, nav, markSeen]);

  useEffect(() => {
    if (!roomLoading && room && !room.isMember && roomId) {
      console.log("[WhisperLock] chat — re-joining room", { roomId });
      void joinRoom(roomId, { myNickname: room.myNickname }).then((r) => {
        if (r.ok) console.log("[WhisperLock] chat — re-joined", { roomId });
        else console.warn("[WhisperLock] chat — re-join failed", r);
      });
    }
  }, [room, roomLoading, roomId]);

  useEffect(() => {
    if (!roomLoading && !room) nav({ to: "/rooms" });
  }, [room, roomLoading, nav]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isPartnerTyping]);

  const handleSend = async () => {
    if (fake) return toast.error("Decoy mode");
    const text = draft.trim();
    if (!text || !room) return;
    setSending(true);
    try {
      await send({ text, replyToId: replyTo?.id });
      setDraft("");
      setReplyTo(null);
    } finally {
      setSending(false);
    }
  };

  const handleMedia = async (file: File) => {
    if (fake || !room) return;
    setSending(true);
    setShowAttach(false);
    haptic("light");
    try {
      const result = await mediaUpload.upload(file);
      if (!result) return;
      await send({
        type: result.type,
        fileUrl: result.url,
        fileName: result.fileName,
        text: result.fileName,
        replyToId: replyTo?.id,
      });
      setReplyTo(null);
      haptic("success");
      toast.success("Media sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      console.error("[WhisperLock] chat — media send failed", err);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const onDropFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    void handleMedia(list[0]);
  };

  const setTimerMode = async (v: DisappearMode) => {
    if (!room) return;
    await updateRoomMeta(room.id, { disappear: v });
    updateRoom(room.id, { disappear: v });
    setShowTimer(false);
    toast.success(`Disappear: ${v}`);
  };

  const handleLeaveRoom = async () => {
    await leaveRoom(roomId);
    deleteRoom(roomId);
    toast.success("Left room");
    nav({ to: "/rooms" });
  };

  const handleDeleteRoom = async () => {
    await burnRoomMessages(roomId);
    await deleteRoomData(roomId);
    deleteRoom(roomId);
    toast.success("Room removed");
    nav({ to: "/rooms" });
  };

  const handleVoiceSend = async () => {
    const file = await voice.stop();
    if (file) await handleMedia(file);
  };

  const startVoiceNote = async () => {
    try {
      await voice.start();
      haptic("medium");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Microphone required");
    }
  };

  const burn = async () => {
    await burnRoomMessages(roomId);
    toast.success("Chat incinerated 🔥");
  };

  const grouped = useMemo(() => groupByDay(messages), [messages]);
  const firstUnreadIdx = useMemo(() => {
    const uid = messages.find((m) => !m.seen && !isMe(m.sender))?.id;
    return uid ? messages.findIndex((m) => m.id === uid) : -1;
  }, [messages]);

  if (roomLoading || !room) return null;

  return (
    <main className="relative flex h-dvh flex-col">
      <CallOverlay
        callState={call.callState}
        incoming={call.incoming}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        duration={call.duration}
        muted={call.muted}
        cameraOn={call.cameraOn}
        onAccept={() => void call.accept(call.incoming?.roomCode)}
        onDecline={() => void call.decline(call.incoming?.roomCode)}
        onEnd={() => void call.end()}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
        onSwitchCamera={call.switchCamera}
        onToggleSpeaker={call.toggleSpeaker}
        speakerOn={call.speakerOn}
      />
      <Particles count={10} />

      {/* Header */}
      <header className="glass-strong sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <button
          onClick={() => nav({ to: "/rooms" })}
          className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-white/5"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-romance text-lg shadow-glow-pink">
          {room.mood ?? "💜"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-semibold">{room.partnerNickname}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isOnline ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-muted-foreground",
              )}
            />
            {statusLabel} ·{" "}
            <Shield className="h-3 w-3 text-[var(--neon-cyan)]" />
            <span className="tracking-[0.15em]">{room.id}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => { haptic("light"); void call.startVoice(); }}
          className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-white/5"
          aria-label="Voice call"
        >
          <Phone className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => { haptic("light"); void call.startVideo(); }}
          className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-white/5"
          aria-label="Video call"
        >
          <Video className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => nav({ to: "/widget/$roomId", params: { roomId } })}
          className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-white/5"
          aria-label="Couple widget"
        >
          <LayoutGrid className="h-5 w-5" />
        </button>
        <button
          onClick={() => setShowTimer((s) => !s)}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-2xl transition",
            room.disappear !== "off"
              ? "bg-gradient-romance text-white shadow-glow-pink"
              : "hover:bg-white/5",
          )}
          aria-label="Disappearing timer"
        >
          <Timer className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setShowRoomMenu(true)}
          className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-white/5"
          aria-label="Room menu"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      <RoomMenu
        open={showRoomMenu}
        onClose={() => setShowRoomMenu(false)}
        roomCode={roomId}
        invite={room.invite ?? null}
        onLeave={() => void handleLeaveRoom()}
        onDelete={() => void handleDeleteRoom()}
        onSettings={() => nav({ to: "/settings" })}
      />

      {/* Timer dropdown */}
      <AnimatePresence>
        {showTimer && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-strong absolute right-3 top-[68px] z-40 w-52 rounded-2xl p-2"
          >
            <p className="px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Disappearing messages
            </p>
            {TIMER_OPTS.map((o) => (
              <button
                key={o.v}
                onClick={() => setTimerMode(o.v)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition",
                  room.disappear === o.v
                    ? "bg-gradient-romance text-white"
                    : "hover:bg-white/5",
                )}
              >
                {o.label}
                {room.disappear === o.v && <Heart className="h-4 w-4" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <motion.div
        ref={scrollRef}
        className={cn(
          "scrollbar-hidden relative flex-1 space-y-1 overflow-y-auto px-4 py-6",
          dragOver && "ring-2 ring-inset ring-[var(--neon-pink)]/40",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) onDropFiles(e.dataTransfer.files);
        }}
      >
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-[var(--neon-pink)]/50 bg-black/40 backdrop-blur-sm"
          >
            <p className="text-sm font-medium text-[var(--neon-pink)]">Drop to share</p>
          </motion.div>
        )}
        {grouped.map(({ day, items }) => (
          <div key={day} className="space-y-1">
            <div className="my-4 flex items-center justify-center">
              <span className="glass rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {day}
              </span>
            </div>
            {items.map((m, i) => {
              const prev = items[i - 1];
              const sameAuthor = prev && prev.sender === m.sender;
              const globalIdx = messages.findIndex((x) => x.id === m.id);
              const reply = m.replyToId
                ? messages.find((x) => x.id === m.replyToId)
                : null;
              return (
                <div key={m.id}>
                  {globalIdx === firstUnreadIdx && (
                    <div className="my-3 flex items-center gap-2">
                      <span className="h-px flex-1 bg-[var(--neon-pink)]/40" />
                      <span className="text-[10px] uppercase tracking-widest text-[var(--neon-pink)]">New</span>
                      <span className="h-px flex-1 bg-[var(--neon-pink)]/40" />
                    </div>
                  )}
                  <Bubble
                    msg={m}
                    reply={reply ?? undefined}
                    groupTop={!sameAuthor}
                    onReply={() => setReplyTo(m)}
                    onReact={(emoji) => {
                      void react(m.id, emoji);
                      setReactingFor(null);
                    }}
                    reacting={reactingFor === m.id}
                    setReacting={(v) => setReactingFor(v ? m.id : null)}
                  />
                </div>
              );
            })}
          </div>
        ))}

        <AnimatePresence>
          {isPartnerTyping && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 pl-2"
            >
              <div className="glass flex h-8 items-center gap-1 rounded-full px-3">
                <Dot delay={0} />
                <Dot delay={0.15} />
                <Dot delay={0.3} />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {room.partnerNickname} is typing…
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Upload progress */}
      {mediaUpload.uploads.map((u) => (
        <UploadProgressBar
          key={u.id}
          fileName={u.fileName}
          percent={u.progress.percent}
          status={u.status === "idle" ? "uploading" : u.status}
          error={u.error}
          onCancel={u.status === "uploading" ? () => mediaUpload.cancel(u.id) : undefined}
          onRetry={u.status === "error" ? () => void mediaUpload.retry(u.id) : undefined}
        />
      ))}

      {/* Reply preview */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="glass-strong mx-4 flex items-center gap-3 rounded-t-2xl border-l-4 border-[var(--neon-pink)] px-3 py-2"
          >
            <Reply className="h-4 w-4 text-[var(--neon-pink)]" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Replying to {isMe(replyTo.sender) ? "yourself" : room.partnerNickname}
              </p>
              <p className="truncate text-xs">{replyTo.text}</p>
            </div>
            <button onClick={() => setReplyTo(null)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <VoiceNoteRecorder
        status={voice.status}
        durationLabel={voice.durationLabel}
        onStart={() => {}}
        onPause={voice.pause}
        onResume={voice.resume}
        onStop={() => void handleVoiceSend()}
        onCancel={voice.cancel}
      />

      {/* Composer */}
      <motion.div className="safe-bottom glass-strong border-t border-white/5 px-3 pt-2.5 pb-3">
        <AnimatePresence>
          {showAttach && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 grid grid-cols-5 gap-2 overflow-hidden"
            >
              {[
                { ref: imageRef, icon: ImageIcon, label: "Gallery", accept: "image/*" },
                { ref: cameraRef, icon: Camera, label: "Camera", accept: "image/*", capture: "environment" as const },
                { ref: videoRef, icon: Film, label: "Video", accept: "video/*" },
                { ref: fileRef, icon: Paperclip, label: "File", accept: ".pdf,.doc,.docx,.zip,.txt,application/*" },
              ].map(({ ref: inputRef, icon: Icon, label, accept, capture }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="glass flex flex-col items-center gap-1 rounded-2xl py-3 text-[10px] hover:bg-white/10"
                >
                  <Icon className="h-5 w-5" />
                  {label}
                  <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    capture={capture}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleMedia(f);
                      e.target.value = "";
                      setShowAttach(false);
                    }}
                  />
                </button>
              ))}
              <button
                type="button"
                onClick={() => void startVoiceNote()}
                className="glass flex flex-col items-center gap-1 rounded-2xl py-3 text-[10px] hover:bg-white/10"
              >
                <Mic className="h-5 w-5" />
                Voice
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowAttach((s) => !s)}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition",
              showAttach ? "bg-gradient-romance text-white" : "text-muted-foreground hover:bg-white/5",
            )}
          >
            <Plus className="h-5 w-5" />
          </button>
          <motion.div className="glass flex flex-1 items-end gap-1 rounded-3xl px-3 py-1.5">
            <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
              <Smile className="h-5 w-5" />
            </button>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                onDraftChange();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              placeholder="Whisper something…"
              className="max-h-32 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => imageRef.current?.click()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <ImageIcon className="h-5 w-5" />
            </button>
          </motion.div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              if (draft.trim()) void handleSend();
              else if (voice.isActive) void handleVoiceSend();
              else void startVoiceNote();
            }}
            disabled={sending || mediaUpload.isUploading}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition",
              draft.trim() || voice.isActive
                ? "bg-gradient-romance text-white shadow-glow-pink"
                : "glass text-muted-foreground",
            )}
            aria-label={draft.trim() ? "Send" : "Voice note"}
          >
            {sending ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
              >
                <Send className="h-5 w-5" />
              </motion.span>
            ) : draft.trim() ? (
              <Send className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </motion.button>
        </div>
      </motion.div>
    </main>
  );
}

function Bubble({
  msg, reply, groupTop, onReply, onReact, reacting, setReacting,
}: {
  msg: ChatMessage;
  reply?: ChatMessage;
  groupTop: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  reacting: boolean;
  setReacting: (v: boolean) => void;
}) {
  const me = isMe(msg.sender);
  const disappearLeft =
    msg.disappearMode && msg.disappearMode !== "off" && msg.disappearMode !== "after-seen"
      ? disappearCountdown(msg)
      : null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", damping: 22, stiffness: 280 }}
      className={cn(
        "flex w-full items-end gap-2",
        me ? "justify-end" : "justify-start",
        groupTop ? "mt-3" : "mt-1",
      )}
      onDoubleClick={() => setReacting(!reacting)}
    >
      <div className={cn("relative max-w-[78%]", me && "order-2")}>
        {reply && (
          <div
            className={cn(
              "mb-1 truncate rounded-2xl border-l-2 px-3 py-1 text-[11px]",
              "border-[var(--neon-pink)] bg-white/5 text-muted-foreground",
            )}
          >
            ↩ {reply.text}
          </div>
        )}
        <div
          className={cn(
            "relative px-4 py-2.5 text-sm leading-snug shadow-sm",
            me
              ? "rounded-3xl rounded-br-md bg-gradient-romance text-white"
              : "rounded-3xl rounded-bl-md glass",
          )}
        >
          {msg.type !== "text" && (msg.fileUrl ?? msg.mediaUrl) ? (
            <MediaMessageContent msg={msg} me={me} />
          ) : (
            msg.text
          )}
          {msg.reaction && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={cn(
                "absolute -bottom-2 rounded-full bg-black px-1.5 py-0.5 text-xs ring-1 ring-white/10",
                me ? "left-2" : "right-2",
              )}
            >
              {msg.reaction}
            </motion.span>
          )}
        </div>
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground",
            me ? "justify-end" : "justify-start",
          )}
        >
          <span>{formatTime(msg.timestamp)}</span>
          {disappearLeft !== null && (
            <span className="inline-flex items-center gap-0.5 text-[var(--neon-pink)]">
              <Timer className="h-3 w-3" /> {disappearLeft}s
            </span>
          )}
          {me && <span>{msg.seen ? "· ✓✓" : "· ✓"}</span>}
        </div>

        {/* Reaction picker */}
        <AnimatePresence>
          {reacting && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "glass-strong absolute -top-12 z-20 flex gap-1 rounded-full px-2 py-1 shadow-glow-violet",
                me ? "right-0" : "left-0",
              )}
            >
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => onReact(e)}
                  className="text-lg transition hover:scale-125"
                >
                  {e}
                </button>
              ))}
              <button
                onClick={() => {
                  onReply();
                  setReacting(false);
                }}
                className="ml-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Reply
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <motion.span
      animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
      transition={{ duration: 1.1, repeat: Infinity, delay }}
      className="h-1.5 w-1.5 rounded-full bg-foreground"
    />
  );
}

function formatTime(t: number) {
  return new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function disappearCountdown(msg: ChatMessage): number | null {
  const ms =
    msg.disappearMode === "5s"
      ? 5_000
      : msg.disappearMode === "30s"
        ? 30_000
        : msg.disappearMode === "1m"
          ? 60_000
          : msg.disappearMode === "1h"
            ? 3_600_000
            : null;
  if (!ms) return null;
  return Math.max(0, Math.ceil((ms - (Date.now() - msg.timestamp)) / 1000));
}

function groupByDay(msgs: ChatMessage[]) {
  const out: { day: string; items: ChatMessage[] }[] = [];
  for (const m of msgs) {
    const day = new Date(m.timestamp).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(m);
    else out.push({ day, items: [m] });
  }
  return out;
}
