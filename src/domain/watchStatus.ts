/** Watch status line for this cut: Hole N only. Yards-to-green stay off Watch. */

export function formatWatchHoleLine(holeNumber: number): string {
  const n = Number.isFinite(holeNumber) ? Math.max(1, Math.round(holeNumber)) : 1;
  return `Hole ${n}`;
}
