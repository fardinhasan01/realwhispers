import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/whisper/Logo";
import { Particles } from "@/components/whisper/Particles";
import { PinPad } from "@/components/whisper/PinPad";
import { GlassCard } from "@/components/whisper/GlassCard";
import { Switch } from "@/components/ui/switch";
import {
  defaultSettings,
  saveSettings,
  setUnlocked,
} from "@/lib/whisper-store";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/onboard")({
  component: Onboard,
});

type Step = "welcome" | "pin" | "confirm" | "fake" | "done";

function Onboard() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(false);
  const [wantFake, setWantFake] = useState(true);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6">
      <Particles count={20} />
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <motion.div
            key="w"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex w-full max-w-md flex-col items-center gap-8 text-center"
          >
            <Logo size={88} />
            <div className="space-y-3">
              <h1 className="font-display text-4xl font-bold">
                Welcome to <span className="text-gradient-romance">WhisperLock</span>
              </h1>
              <p className="text-sm text-muted-foreground">
                Encrypted messages for two. No emails, no usernames, no traces.
                Set up a private PIN to unlock your world.
              </p>
            </div>
            <GlassCard className="w-full space-y-3 text-left text-sm">
              <Row icon="🔒" title="End-to-end encrypted" sub="AES-256 + signal-style architecture" />
              <Row icon="💜" title="Disappearing messages" sub="Self-destruct after seen, or on a timer" />
              <Row icon="🫥" title="Stealth mode" sub="Fake PIN, blur on switch, panic wipe" />
            </GlassCard>
            <button
              onClick={() => setStep("pin")}
              className="w-full rounded-full bg-gradient-romance py-4 font-display text-base font-semibold text-white shadow-glow-pink active:scale-[0.98] transition"
            >
              Create my PIN
            </button>
          </motion.div>
        )}

        {step === "pin" && (
          <StepCard key="p" title="Set your PIN" sub="4 digits unlock your secret room.">
            <PinPad
              onComplete={(p) => {
                setPin(p);
                setStep("confirm");
              }}
            />
          </StepCard>
        )}

        {step === "confirm" && (
          <StepCard key="c" title="Confirm PIN" sub="Type it again to memorize.">
            <PinPad
              error={error}
              hint={error ? "PINs don't match — try again" : undefined}
              onComplete={(p) => {
                if (p !== pin) {
                  setError(true);
                  setTimeout(() => setError(false), 600);
                  return;
                }
                setConfirm(p);
                setStep("fake");
              }}
            />
          </StepCard>
        )}

        {step === "fake" && (
          <motion.div
            key="f"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex w-full max-w-md flex-col gap-6"
          >
            <div className="text-center">
              <Sparkles className="mx-auto h-8 w-8 text-[var(--neon-violet)]" />
              <h2 className="mt-3 font-display text-3xl font-bold">Stealth mode</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Want a decoy PIN? It opens an empty fake account — perfect under pressure.
              </p>
            </div>
            <GlassCard className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable Fake PIN</p>
                <p className="text-xs text-muted-foreground">Use 0000 as decoy</p>
              </div>
              <Switch checked={wantFake} onCheckedChange={setWantFake} />
            </GlassCard>
            <button
              onClick={() => {
                saveSettings({
                  ...defaultSettings,
                  pin: confirm,
                  fakePin: wantFake ? "0000" : undefined,
                  biometric: true,
                });
                setUnlocked(true);
                setStep("done");
                setTimeout(() => nav({ to: "/rooms" }), 900);
              }}
              className="rounded-full bg-gradient-romance py-4 font-display font-semibold text-white shadow-glow-pink active:scale-[0.98] transition"
            >
              Finish setup
            </button>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div
            key="d"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <Logo size={120} />
            <p className="mt-6 font-display text-2xl">You're in 💜</p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function StepCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex w-full max-w-md flex-col items-center gap-8 text-center"
    >
      <div>
        <h2 className="font-display text-3xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
      </div>
      {children}
    </motion.div>
  );
}

function Row({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-lg">
        {icon}
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}
