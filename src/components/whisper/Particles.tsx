import { useEffect, useRef } from "react";

/** Soft floating romantic particles for the AMOLED background. */
export function Particles({ count = 28 }: { count?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const span = document.createElement("span");
      const size = 2 + Math.random() * 5;
      const left = Math.random() * 100;
      const delay = Math.random() * 8;
      const dur = 8 + Math.random() * 10;
      const hue = Math.random() > 0.5 ? "var(--neon-pink)" : "var(--neon-violet)";
      span.style.cssText = `
        position:absolute;left:${left}%;bottom:-20px;
        width:${size}px;height:${size}px;border-radius:9999px;
        background:${hue};opacity:.55;filter:blur(1px);
        box-shadow:0 0 12px ${hue};
        animation: wl-rise ${dur}s linear ${delay}s infinite;
      `;
      el.appendChild(span);
    }
  }, [count]);
  return (
    <>
      <style>{`@keyframes wl-rise { to { transform: translateY(-110vh) translateX(20px); opacity: 0 } }`}</style>
      <div
        ref={ref}
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      />
    </>
  );
}
