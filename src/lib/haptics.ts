export function haptic(type: "light" | "medium" | "heavy" | "success" = "light") {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const patterns: Record<string, number | number[]> = {
    light: 8,
    medium: 16,
    heavy: 28,
    success: [10, 40, 10],
  };
  navigator.vibrate(patterns[type] ?? 8);
}
