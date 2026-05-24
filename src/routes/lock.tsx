import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Logo } from "@/components/whisper/Logo";
import { Particles } from "@/components/whisper/Particles";
import { PinPad } from "@/components/whisper/PinPad";
import { getSettings, panicWipe, setUnlocked } from "@/lib/whisper-store";
import { initSecureCache } from "@/lib/secure-cache";
import { toast } from "sonner";

export const Route = createFileRoute("/lock")({
  component: Lock,
});

function Lock() {
  const nav = useNavigate();
  const settings = getSettings();
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const submit = (pin: string) => {
    if (pin === settings.pin) {
      void initSecureCache(pin);
      setUnlocked(true);
      nav({ to: "/rooms" });
    } else if (settings.fakePin && pin === settings.fakePin) {
      setUnlocked(true, true);
      nav({ to: "/rooms" });
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setError(true);
      setTimeout(() => setError(false), 600);
      if (settings.panicWipeOnFail && next >= settings.panicWipeOnFail) {
        panicWipe();
        toast.error("Too many attempts. Vault wiped.");
        nav({ to: "/onboard" });
      }
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <Particles count={18} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 text-center"
      >
        <Logo size={84} />
        <div>
          <h1 className="font-display text-3xl font-bold">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your PIN to unlock the vault.
          </p>
        </div>
        <PinPad
          length={settings.pin.length || 4}
          onComplete={submit}
          showBiometric={settings.biometric}
          onBiometric={() => {
            toast.success("Biometric unlocked 💜");
            setUnlocked(true);
            nav({ to: "/rooms" });
          }}
          error={error}
          hint={
            error
              ? `Wrong PIN${attempts > 1 ? ` · ${attempts} attempts` : ""}`
              : "Use Face ID / Fingerprint or enter PIN"
          }
        />
      </motion.div>
    </main>
  );
}
