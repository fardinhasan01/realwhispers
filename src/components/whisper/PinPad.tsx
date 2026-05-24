import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

interface PinPadProps {
  length?: number;
  onComplete: (pin: string) => void;
  showBiometric?: boolean;
  onBiometric?: () => void;
  error?: boolean;
  hint?: string;
}

export function PinPad({
  length = 4,
  onComplete,
  showBiometric,
  onBiometric,
  error,
  hint,
}: PinPadProps) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      const t = setTimeout(() => {
        setShake(false);
        setPin("");
      }, 450);
      return () => clearTimeout(t);
    }
  }, [error]);

  const press = (d: string) => {
    if (pin.length >= length) return;
    const next = pin + d;
    setPin(next);
    if (next.length === length) setTimeout(() => onComplete(next), 120);
  };
  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-8 select-none">
      <motion.div
        animate={shake ? { x: [-10, 10, -8, 8, -4, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
        className="flex gap-3"
      >
        {Array.from({ length }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <motion.div
              key={i}
              animate={{
                scale: filled ? 1 : 0.85,
                boxShadow: filled
                  ? "0 0 18px var(--neon-pink), 0 0 36px color-mix(in oklab, var(--neon-violet) 40%, transparent)"
                  : "0 0 0 transparent",
              }}
              className={cn(
                "h-4 w-4 rounded-full border",
                filled
                  ? "border-transparent bg-gradient-romance"
                  : "border-white/25 bg-white/5",
              )}
            />
          );
        })}
      </motion.div>

      <AnimatePresence mode="wait">
        {hint && (
          <motion.p
            key={hint}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "text-sm font-medium tracking-wide",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {hint}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <PadButton key={d} onClick={() => press(d)}>
            {d}
          </PadButton>
        ))}
        <PadButton
          ghost
          onClick={onBiometric}
          disabled={!showBiometric}
          ariaLabel="Biometric"
        >
          {showBiometric ? <Fingerprint className="h-6 w-6" /> : ""}
        </PadButton>
        <PadButton onClick={() => press("0")}>0</PadButton>
        <PadButton ghost onClick={back} ariaLabel="Backspace">
          <Delete className="h-6 w-6" />
        </PadButton>
      </div>
    </div>
  );
}

function PadButton({
  children,
  onClick,
  ghost,
  disabled,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ghost?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.04 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-full text-2xl font-display font-medium transition-colors",
        ghost
          ? "text-muted-foreground hover:text-foreground"
          : "glass text-foreground hover:bg-white/10",
        disabled && "opacity-30 pointer-events-none",
      )}
    >
      {children}
    </motion.button>
  );
}
