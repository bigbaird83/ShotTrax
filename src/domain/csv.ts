/**
 * RFC 4180 CSV. Every text cell is quoted. Numbers stay plain, including negatives.
 * A leading apostrophe guards text that a spreadsheet would treat as a formula.
 */

export const CSV_BOM = '\uFEFF';

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvText(value: string | null | undefined): string {
  let text = value ?? '';
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Missing numbers stay empty. Never coerced to 0. Never quoted or prefixed. */
export function csvNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return String(value);
}

export function buildCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headers.map((header) => csvText(header)).join(',')];
  for (const row of rows) lines.push(row.join(','));
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}
