import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function GlassCard({
  className,
  glow,
  ...props
}: HTMLAttributes<HTMLDivElement> & { glow?: "pink" | "violet" }) {
  return (
    <div
      {...props}
      className={cn(
        "glass rounded-3xl p-5",
        glow === "pink" && "neon-ring-pink",
        glow === "violet" && "neon-ring-violet",
        className,
      )}
    />
  );
}
