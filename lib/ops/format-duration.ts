/** Format a duration in minutes with automatic unit scaling. */
export function fmtDurationMinutes(minutes: number | null | undefined): string {  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "-";

  const m = Math.max(0, minutes);
  if (m < 60) return `${m.toFixed(2)} min`;

  const hours = m / 60;
  if (hours < 24) return `${hours.toFixed(1)} hr`;

  const days = hours / 24;
  if (days < 30) return `${days.toFixed(1)} days`;

  const months = days / 30;
  if (months < 12) return `${months.toFixed(1)} mo`;

  const years = months / 12;
  return `${years.toFixed(1)} yr`;
}
