export function formatMessageTimeUtc(createdAt: string): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) return '--:--';

  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');

  return `${hh}:${mm}`;
}
