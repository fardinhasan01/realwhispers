/** Normalize secret room codes: trim whitespace, uppercase. */
export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}
