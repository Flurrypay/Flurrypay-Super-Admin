/** Coarse age for operations queues: "< 1 h", "5 h", "2 d 3 h". */
export function formatAge(hours: number): string {
  if (!Number.isFinite(hours) || hours < 1) return "< 1 h";
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  if (days === 0) return `${rest} h`;
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}
