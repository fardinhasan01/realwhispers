import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Logo } from "@/components/whisper/Logo";
import { Particles } from "@/components/whisper/Particles";
import { isOnboarded, isUnlocked } from "@/lib/whisper-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WhisperLock — Just us. Forever encrypted." },
      { name: "description", content: "An ultra-private, AMOLED-dark messaging room for two. Disappearing messages, biometric lock, no usernames." },
    ],
  }),
  component: Splash,
});

function Splash() {
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => {
      if (!isOnboarded()) nav({ to: "/onboard" });
      else if (!isUnlocked()) nav({ to: "/lock" });
      else nav({ to: "/rooms" });
    }, 1500);
    return () => clearTimeout(t);
  }, [nav]);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Particles count={36} />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Logo size={120} />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 font-display text-5xl font-bold tracking-tight"
      >
        Whisper<span className="text-gradient-romance">Lock</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-3 max-w-xs text-sm text-muted-foreground"
      >
        A secret little universe. <br /> Just for the two of you.
      </motion.p>
    </main>
  );
}
