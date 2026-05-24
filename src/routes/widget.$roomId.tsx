import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, Sparkles } from "lucide-react";
import { Particles } from "@/components/whisper/Particles";
import { GlassCard } from "@/components/whisper/GlassCard";
import { normalizeRoomCode } from "@/lib/room-code";
import { isOnboarded, isUnlocked } from "@/lib/whisper-store";
import { useWidget } from "@/hooks/useWidget";
import { haptic } from "@/lib/haptics";

export const Route = createFileRoute("/widget/$roomId")({
  component: WidgetPage,
});

const EMOJIS = ["❤️", "🥺", "😘", "😭", "✨", "🌙", "🔥", "💜"];

function WidgetPage() {
  const { roomId: raw } = Route.useParams();
  const roomId = normalizeRoomCode(raw);
  const nav = useNavigate();
  const { widget, update, sendHeart, thinkingOfYou } = useWidget(roomId);
  const [note, setNote] = useState("");
  const [doodle, setDoodle] = useState("");

  useEffect(() => {
    if (!isOnboarded()) nav({ to: "/onboard" });
    if (!isUnlocked()) nav({ to: "/lock" });
  }, [nav]);

  useEffect(() => {
    setNote(widget.note);
    setDoodle(widget.doodle);
  }, [widget.note, widget.doodle]);

  const saveNote = () => {
    void update({ note });
    haptic("light");
  };

  const saveDoodle = () => {
    void update({ doodle });
    haptic("light");
  };

  return (
    <main className="relative min-h-dvh px-4 pt-10 pb-8">
      <Particles count={12} />
      <header className="mx-auto flex max-w-md items-center gap-3">
        <button
          type="button"
          onClick={() => nav({ to: "/rooms" })}
          className="flex h-10 w-10 items-center justify-center rounded-2xl glass"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Live widget</p>
          <h1 className="font-display text-xl font-bold">Our space</h1>
        </div>
      </header>

      <section className="mx-auto mt-6 max-w-md space-y-4">
        <GlassCard glow="pink" className="text-center">
          <motion.div
            animate={{ scale: widget.thinkingOfYou ? [1, 1.1, 1] : 1 }}
            transition={{ repeat: widget.thinkingOfYou ? Infinity : 0, duration: 1 }}
            className="text-5xl"
          >
            {widget.mood}
          </motion.div>
          <p className="mt-2 font-display text-2xl font-bold">{widget.hearts} ❤️</p>
          {widget.thinkingOfYou && (
            <p className="mt-1 text-sm text-[var(--neon-pink)] animate-pulse">Thinking of you…</p>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { void update({ mood: e, lastEmoji: e }); haptic("light"); }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl glass text-xl hover:bg-white/10"
              >
                {e}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { void sendHeart(); haptic("success"); }}
            className="mt-4 w-full rounded-2xl bg-gradient-romance py-3 font-semibold text-white shadow-glow-pink"
          >
            <Heart className="mr-2 inline h-4 w-4" /> Send heart
          </button>
          <button
            type="button"
            onClick={() => { void thinkingOfYou(); haptic("medium"); }}
            className="mt-2 w-full rounded-2xl border border-white/10 py-3 text-sm"
          >
            Thinking of you 💭
          </button>
        </GlassCard>

        <GlassCard className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Tiny note</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            rows={2}
            placeholder="Leave a whisper…"
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none"
          />
        </GlassCard>

        <GlassCard className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Shared doodle</p>
          <textarea
            value={doodle}
            onChange={(e) => setDoodle(e.target.value)}
            onBlur={saveDoodle}
            rows={3}
            placeholder="Draw with emoji & symbols ✨ ~ ~ ❤️"
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm outline-none"
          />
          {widget.lastEmoji && (
            <p className="text-center text-2xl animate-bounce">{widget.lastEmoji}</p>
          )}
        </GlassCard>

        <GlassCard glow="violet" className="text-center text-xs text-muted-foreground">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-[var(--neon-violet)]" />
          Pin this room on your Android home screen via the WhisperLock widget (syncs live via Firebase).
        </GlassCard>
      </section>
    </main>
  );
}
