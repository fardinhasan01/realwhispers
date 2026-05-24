import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, QrCode, Users, ArrowRight, Trash2, KeyRound, Loader2,
} from "lucide-react";
import { Particles } from "@/components/whisper/Particles";
import { GlassCard } from "@/components/whisper/GlassCard";
import { AppNav } from "@/components/whisper/AppNav";
import {
  deleteRoom,
  generateRoomCode,
  getRooms,
  cacheRoom,
  isFakeMode,
  isOnboarded,
  isUnlocked,
  setActiveRoom,
  type Room,
} from "@/lib/whisper-store";
import { createRoom as createFirebaseRoom, joinRoom } from "@/services/roomService";
import { joinViaQR } from "@/services/qrService";
import type { RoomInvite } from "@/services/qrService";
import { normalizeRoomCode } from "@/lib/room-code";
import { QrScanner } from "@/components/whisper/QrScanner";
import { RoomQrCard } from "@/components/whisper/RoomQrCard";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rooms")({
  component: Rooms,
});

function Rooms() {
  const nav = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tab, setTab] = useState<"create" | "join">("create");
  const [previewCode, setPreviewCode] = useState(generateRoomCode());
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showQrScan, setShowQrScan] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<RoomInvite | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const fake = isFakeMode();

  useEffect(() => {
    if (!isOnboarded()) nav({ to: "/onboard" });
    else if (!isUnlocked()) nav({ to: "/lock" });
    else setRooms(fake ? [] : getRooms());
  }, [nav, fake]);

  const enterRoom = (id: string) => {
    setActiveRoom(id);
    nav({ to: "/chat/$roomId", params: { roomId: id } });
  };

  const handleCreate = async () => {
    if (fake) return toast.error("Decoy mode is read-only");
    const code = normalizeRoomCode(previewCode);
    if (code.length < 6) return toast.error("Invalid room code");
    setLoading(true);
    try {
      const result = await createFirebaseRoom(code, { myNickname: "Me" });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCreatedInvite(result.invite);
      setCreatedCode(code);
      haptic("success");
      cacheRoom({
        id: code,
        createdAt: Date.now(),
        partnerNickname: "Waiting…",
        myNickname: "Me",
        mood: "💜",
        theme: "rose",
        disappear: "off",
      });
      setRooms(getRooms());
      toast.success("Room created — share the code!");
      enterRoom(code);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (fake) return toast.error("Decoy mode is read-only");
    const code = normalizeRoomCode(joinCode);
    if (code.length < 6) {
      setJoinError(true);
      setTimeout(() => setJoinError(false), 600);
      return toast.error("Enter the full secret code");
    }
    setLoading(true);
    setJoinError(false);
    try {
      const result = await joinRoom(code, { myNickname: "Me" });
      if (!result.ok) {
        setJoinError(true);
        setTimeout(() => setJoinError(false), 600);
        if (result.error === "not_found") toast.error("Room not found");
        else if (result.error === "full") toast.error("Room is full (max 2)");
        return;
      }
      cacheRoom({
        id: code,
        createdAt: Date.now(),
        partnerNickname: "Partner",
        myNickname: "Me",
        mood: result.room.mood ?? "💜",
        theme: result.room.theme ?? "rose",
        disappear: result.room.disappear ?? "off",
      });
      setRooms(getRooms());
      enterRoom(code);
    } finally {
      setLoading(false);
    }
  };

  const handleQrScan = async (payload: string) => {
    setLoading(true);
    try {
      const result = await joinViaQR(payload);
      if (!result.ok) {
        haptic("heavy");
        if (result.error === "expired") toast.error("QR invite expired");
        else if (result.error === "full") toast.error("Room is full");
        else toast.error("Invalid or expired QR");
        return;
      }
      cacheRoom({
        id: result.code,
        createdAt: Date.now(),
        partnerNickname: "Partner",
        myNickname: "Me",
        mood: result.room.mood ?? "💜",
        theme: result.room.theme ?? "rose",
        disappear: result.room.disappear ?? "off",
      });
      setRooms(getRooms());
      haptic("success");
      enterRoom(result.code);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-dvh px-5 pt-12 pb-32">
      <QrScanner open={showQrScan} onClose={() => setShowQrScan(false)} onScan={(p) => void handleQrScan(p)} />
      <Particles count={16} />
      <header className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
            <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {fake ? "Decoy vault" : "Your vault"}
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold">
              Private <span className="text-gradient-romance">rooms</span>
            </h1>
          </div>
          <Link
            to="/dashboard"
            className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--neon-pink)]"
          >
            💜
          </Link>
        </div>
      </header>

      <section className="mx-auto mt-8 max-w-md">
        <div className="glass-strong rounded-3xl p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {(["create", "join"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative rounded-2xl py-2.5 text-sm font-medium capitalize transition ${
                  tab === t ? "text-white" : "text-muted-foreground"
                }`}
              >
                {tab === t && (
                  <motion.span
                    layoutId="tabpill"
                    className="absolute inset-0 -z-10 rounded-2xl bg-gradient-romance"
                  />
                )}
                {t === "create" ? "Create room" : "Join room"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <AnimatePresence mode="wait">
            {tab === "create" ? (
              <motion.div
                key="c"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <GlassCard glow="pink" className="space-y-5 text-center">
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                    Your secret code
                  </p>
                  <motion.h2
                    key={previewCode}
                    initial={{ scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="font-display text-3xl font-bold tracking-[0.18em] text-gradient-aurora"
                  >
                    {previewCode}
                  </motion.h2>
                  <p className="text-xs text-muted-foreground">
                    Share code or QR. Max 2 members. Live sync.
                  </p>
                  {createdInvite && createdCode === previewCode && (
                    <RoomQrCard roomCode={previewCode} invite={createdInvite} />
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewCode(generateRoomCode())}
                      disabled={loading}
                      className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
                    >
                      Reroll
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={loading}
                      className="flex-1 rounded-2xl bg-gradient-romance py-3 text-sm font-semibold text-white shadow-glow-pink active:scale-[0.97] transition disabled:opacity-50"
                    >
                      <span className="inline-flex items-center justify-center gap-1.5">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Create
                      </span>
                    </button>
                  </div>
                </GlassCard>
              </motion.div>
            ) : (
              <motion.div
                key="j"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <GlassCard glow="violet" className="space-y-4">
                  <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5" /> Secret room code
                  </label>
                  <motion.input
                    value={joinCode}
                    onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
                    placeholder="MOON-7X-LOVE"
                    animate={joinError ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                    transition={{ duration: 0.4 }}
                    className={cn(
                      "w-full rounded-2xl border bg-black/40 px-5 py-4 text-center font-display text-xl tracking-[0.2em] outline-none focus:ring-2",
                      joinError
                        ? "border-destructive focus:border-destructive focus:ring-destructive/40"
                        : "border-white/10 focus:border-[var(--neon-pink)] focus:ring-[var(--neon-pink)]/40",
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQrScan(true)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-medium hover:bg-white/10"
                    >
                      <QrCode className="h-4 w-4" /> Scan QR
                    </button>
                    <button
                      onClick={handleJoin}
                      disabled={loading}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-aurora py-3 text-sm font-semibold text-white shadow-glow-violet active:scale-[0.97] transition disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Join <ArrowRight className="h-4 w-4" /></>}
                    </button>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-md">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Active rooms
          </p>
          <span className="text-xs text-muted-foreground">{rooms.length}</span>
        </div>
        {rooms.length === 0 ? (
          <GlassCard className="py-10 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-2xl animate-float">
              💌
            </div>
            <p className="font-medium">{fake ? "Nothing here." : "No rooms yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fake
                ? "This decoy account is empty by design."
                : "Create one and share the code with your love."}
            </p>
          </GlassCard>
        ) : (
          <ul className="space-y-3">
            {rooms.map((r) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -40 }}
              >
                <div className="glass group flex items-center gap-4 rounded-3xl p-4 transition hover:border-white/20">
                  <button
                    onClick={() => enterRoom(r.id)}
                    className="flex flex-1 items-center gap-4 text-left"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-romance text-xl shadow-glow-pink">
                      {r.mood ?? "💜"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-semibold">
                        {r.partnerNickname}
                      </p>
                      <p className="truncate text-xs text-muted-foreground tracking-[0.15em]">
                        {r.id}
                      </p>
                    </div>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => {
                      deleteRoom(r.id);
                      setRooms(getRooms());
                      toast("Room removed from device");
                    }}
                    className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                    aria-label="Delete room"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <AppNav />
    </main>
  );
}