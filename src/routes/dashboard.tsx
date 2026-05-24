import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Calendar, Sparkles, BookHeart, Clock } from "lucide-react";
import { Particles } from "@/components/whisper/Particles";
import { GlassCard } from "@/components/whisper/GlassCard";
import { AppNav } from "@/components/whisper/AppNav";
import {
  getRooms, isOnboarded, isUnlocked, updateRoom, type Room,
} from "@/lib/whisper-store";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

const MOODS = ["💜", "🥺", "🔥", "🌙", "☁️", "⚡", "🌹", "🫶"];

function Dashboard() {
  const nav = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [annDate, setAnnDate] = useState("");

  useEffect(() => {
    if (!isOnboarded()) { nav({ to: "/onboard" }); return; }
    if (!isUnlocked()) { nav({ to: "/lock" }); return; }
    const r = getRooms()[0] ?? null;
    setRoom(r);
    if (r?.anniversary) {
      setAnnDate(new Date(r.anniversary).toISOString().slice(0, 10));
    }
  }, [nav]);

  const days = useMemo(() => {
    if (!room?.anniversary) return null;
    const ms = Date.now() - room.anniversary;
    return Math.max(0, Math.floor(ms / 86400000));
  }, [room]);

  const loveMeter = useMemo(() => {
    if (!days) return 42;
    return Math.min(100, 60 + (days % 40));
  }, [days]);

  const setMood = (m: string) => {
    if (!room) return;
    updateRoom(room.id, { mood: m });
    setRoom({ ...room, mood: m });
  };

  if (!room) {
    return (
      <main className="relative min-h-dvh px-5 pt-12 pb-32">
        <Particles count={14} />
        <h1 className="font-display text-3xl font-bold">
          Our <span className="text-gradient-romance">space</span>
        </h1>
        <GlassCard className="mt-8 py-10 text-center">
          <p>Create a room first to unlock couple features.</p>
          <button
            onClick={() => nav({ to: "/rooms" })}
            className="mt-4 rounded-full bg-gradient-romance px-5 py-2 text-sm font-semibold text-white shadow-glow-pink"
          >
            Go to rooms
          </button>
        </GlassCard>
        <AppNav />
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh px-5 pt-12 pb-32">
      <Particles count={18} />
      <header className="mx-auto max-w-md">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Couple dashboard
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold">
          {room.myNickname} <span className="text-gradient-romance">&amp;</span>{" "}
          {room.partnerNickname}
        </h1>
      </header>

      {/* Love meter */}
      <section className="mx-auto mt-6 max-w-md">
        <GlassCard glow="pink" className="text-center">
          <div className="relative mx-auto h-32 w-32">
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Heart className="h-24 w-24 fill-[var(--neon-pink)] text-[var(--neon-pink)] drop-shadow-[0_0_24px_var(--neon-pink)]" />
            </motion.div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-2xl font-bold text-white">
                {loveMeter}%
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Love meter
          </p>
        </GlassCard>
      </section>

      {/* Stats grid */}
      <section className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-3">
        <GlassCard className="space-y-1">
          <Clock className="h-5 w-5 text-[var(--neon-cyan)]" />
          <p className="font-display text-2xl font-bold">
            {days ?? "—"}
            <span className="ml-1 text-sm font-normal text-muted-foreground">days</span>
          </p>
          <p className="text-[11px] text-muted-foreground">Together since</p>
        </GlassCard>
        <GlassCard className="space-y-1">
          <Sparkles className="h-5 w-5 text-[var(--neon-violet)]" />
          <p className="font-display text-2xl font-bold">{room.mood ?? "💜"}</p>
          <p className="text-[11px] text-muted-foreground">Shared mood</p>
        </GlassCard>
      </section>

      {/* Mood picker */}
      <section className="mx-auto mt-4 max-w-md">
        <GlassCard className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Set our mood
          </p>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <motion.button
                whileTap={{ scale: 0.9 }}
                key={m}
                onClick={() => setMood(m)}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl transition ${
                  room.mood === m
                    ? "bg-gradient-romance shadow-glow-pink"
                    : "glass hover:bg-white/10"
                }`}
              >
                {m}
              </motion.button>
            ))}
          </div>
        </GlassCard>
      </section>

      {/* Anniversary */}
      <section className="mx-auto mt-4 max-w-md">
        <GlassCard className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--neon-pink)]" />
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Our anniversary
            </p>
          </div>
          <input
            type="date"
            value={annDate}
            onChange={(e) => {
              setAnnDate(e.target.value);
              const t = new Date(e.target.value).getTime();
              if (!Number.isNaN(t)) {
                updateRoom(room.id, { anniversary: t });
                setRoom({ ...room, anniversary: t });
              }
            }}
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-[var(--neon-pink)]"
          />
        </GlassCard>
      </section>

      {/* Time capsule placeholder */}
      <section className="mx-auto mt-4 max-w-md">
        <GlassCard glow="violet" className="space-y-2">
          <BookHeart className="h-5 w-5 text-[var(--neon-violet)]" />
          <p className="font-display text-lg font-semibold">Time capsule</p>
          <p className="text-xs text-muted-foreground">
            Write a love letter to be unlocked on your next anniversary. Coming
            soon to your vault.
          </p>
          <button className="mt-2 w-full rounded-full bg-gradient-aurora py-2.5 text-sm font-semibold text-white shadow-glow-violet active:scale-[0.97] transition">
            Seal a memory
          </button>
        </GlassCard>
      </section>

      <AppNav />
    </main>
  );
}
