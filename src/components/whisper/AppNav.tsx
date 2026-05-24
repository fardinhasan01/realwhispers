import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, MessageCircleHeart, Settings, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { setUnlocked } from "@/lib/whisper-store";

const items = [
  { to: "/rooms", icon: Home, label: "Rooms" },
  { to: "/dashboard", icon: Sparkles, label: "Us" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function AppNav() {
  const loc = useLocation();
  const nav = useNavigate();
  // hide on chat fullscreen
  if (loc.pathname.startsWith("/chat/")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 safe-bottom px-4 pt-2">
      <div className="glass-strong mx-auto flex max-w-md items-center justify-around rounded-full px-3 py-2 shadow-glow-violet">
        {items.map((it) => {
          const active = loc.pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className="relative flex flex-col items-center gap-0.5 px-4 py-1.5"
            >
              {active && (
                <motion.span
                  layoutId="navpill"
                  className="absolute inset-0 -z-10 rounded-full bg-gradient-romance opacity-90"
                />
              )}
              <Icon
                className={cn(
                  "h-5 w-5 transition",
                  active ? "text-white" : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium transition",
                  active ? "text-white" : "text-muted-foreground",
                )}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => {
            setUnlocked(false);
            nav({ to: "/lock" });
          }}
          className="ml-1 flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <MessageCircleHeart className="h-5 w-5" />
          <span className="text-[10px] font-medium">Lock</span>
        </button>
      </div>
    </nav>
  );
}
