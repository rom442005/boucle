/** Date relative, comme dans un fil : « à l'instant », « il y a 3 h », « hier », « il y a 4 j », puis la date. */
export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} j`;
  const same = new Date(t).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat('fr-FR', same ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(t);
}
