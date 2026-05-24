import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Fingerprint, BellOff, EyeOff, Flame, ShieldAlert,
  KeyRound, Palette, Lock, ChevronRight,
} from "lucide-react";
import { Particles } from "@/components/whisper/Particles";
import { GlassCard } from "@/components/whisper/GlassCard";
import { AppNav } from "@/components/whisper/AppNav";
import { Switch } from "@/components/ui/switch";
import {
  defaultSettings, getSettings, isOnboarded, isUnlocked,
  panicWipe, saveSettings, setUnlocked, type Settings,
} from "@/lib/whisper-store";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const nav = useNavigate();
  const [s, setS] = useState<Settings>(defaultSettings);

  useEffect(() => {
    if (!isOnboarded()) nav({ to: "/onboard" });
    if (!isUnlocked()) nav({ to: "/lock" });
    setS(getSettings());
  }, [nav]);

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
  };

  return (
    <main className="relative min-h-dvh px-5 pt-12 pb-32">
      <Particles count={14} />
      <header className="mx-auto max-w-md">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Vault
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold">
          Settings <span className="text-gradient-romance">&amp; security</span>
        </h1>
      </header>

      <div className="mx-auto mt-6 max-w-md space-y-4">
        <Section title="Security" icon={<Lock className="h-4 w-4" />}>
          <Toggle
            icon={<Fingerprint className="h-5 w-5 text-[var(--neon-pink)]" />}
            title="Biometric unlock"
            sub="Face ID / Fingerprint"
            checked={s.biometric}
            onChange={(v) => update({ biometric: v })}
          />
          <Toggle
            icon={<BellOff className="h-5 w-5 text-[var(--neon-violet)]" />}
            title="Hide notifications"
            sub="No content shown on lock screen"
            checked={s.hideNotifications}
            onChange={(v) => update({ hideNotifications: v })}
          />
          <Toggle
            icon={<EyeOff className="h-5 w-5 text-[var(--neon-cyan)]" />}
            title="Blur in multitasking"
            sub="App preview is hidden when switching"
            checked={s.blurMultitasking}
            onChange={(v) => update({ blurMultitasking: v })}
          />
          <Row
            icon={<KeyRound className="h-5 w-5 text-[var(--neon-pink)]" />}
            title="Change PIN"
            sub={`Current: ${"•".repeat(s.pin.length)}`}
            onClick={() => nav({ to: "/onboard" })}
          />
          <Row
            icon={<ShieldAlert className="h-5 w-5 text-destructive" />}
            title={`Auto-wipe after ${s.panicWipeOnFail} fails`}
            sub="Tap to cycle 5 / 8 / 12"
            onClick={() => {
              const next = s.panicWipeOnFail === 5 ? 8 : s.panicWipeOnFail === 8 ? 12 : 5;
              update({ panicWipeOnFail: next });
            }}
          />
        </Section>

        <Section title="Appearance" icon={<Palette className="h-4 w-4" />}>
          <ThemePicker />
        </Section>

        <Section title="Danger zone" icon={<Flame className="h-4 w-4" />}>
          <button
            onClick={() => {
              setUnlocked(false);
              nav({ to: "/lock" });
            }}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-medium hover:bg-white/10"
          >
            Lock vault now
          </button>
          <button
            onClick={() => {
              if (confirm("Permanently wipe all rooms, messages, and settings?")) {
                panicWipe();
                toast.success("Everything wiped. Starting over.");
                nav({ to: "/onboard" });
              }
            }}
            className="w-full rounded-2xl bg-destructive/15 py-3 text-sm font-semibold text-destructive hover:bg-destructive/25"
          >
            Panic wipe everything
          </button>
        </Section>

        <p className="pt-4 text-center text-[11px] text-muted-foreground">
          WhisperLock · v0.1 · made with 💜
        </p>
      </div>

      <AppNav />
    </main>
  );
}

function Section({
  title, icon, children,
}: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        {icon}
        {title}
      </div>
      <GlassCard className="space-y-2 p-2">{children}</GlassCard>
    </div>
  );
}

function Toggle({
  icon, title, sub, checked, onChange,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5">
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Row({
  icon, title, sub, onClick,
}: { icon: React.ReactNode; title: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/5"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5">
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function ThemePicker() {
  const themes = [
    { id: "rose", grad: "linear-gradient(135deg,#ff4dcd,#a855f7)" },
    { id: "violet", grad: "linear-gradient(135deg,#a855f7,#22d3ee)" },
    { id: "cyan", grad: "linear-gradient(135deg,#22d3ee,#3b82f6)" },
    { id: "aurora", grad: "linear-gradient(135deg,#22d3ee,#a855f7,#ff4dcd)" },
  ];
  const [active, setActive] = useState("rose");
  return (
    <div className="grid grid-cols-4 gap-2 p-2">
      {themes.map((t) => (
        <motion.button
          key={t.id}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            setActive(t.id);
            toast.success(`Theme: ${t.id}`);
          }}
          className={`relative h-16 rounded-2xl ring-2 transition ${
            active === t.id ? "ring-white" : "ring-transparent"
          }`}
          style={{ background: t.grad }}
        >
          <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-semibold text-white capitalize drop-shadow">
            {t.id}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
