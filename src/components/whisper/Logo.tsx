import { Lock, Heart } from "lucide-react";
import { motion } from "framer-motion";

export function Logo({ size = 96 }: { size?: number }) {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", damping: 14, stiffness: 140 }}
      className="relative"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-3xl bg-gradient-romance opacity-90 blur-xl"
        style={{ filter: "blur(28px)" }}
      />
      <div className="relative flex h-full w-full items-center justify-center rounded-3xl bg-gradient-romance shadow-glow-pink">
        <Lock className="absolute h-1/2 w-1/2 text-white/95" strokeWidth={2.4} />
        <Heart
          className="absolute h-1/4 w-1/4 fill-white text-white"
          style={{ transform: "translateY(18%)" }}
        />
      </div>
    </motion.div>
  );
}
