/**
 * Turns rows into CSV that is safe to open in Excel or Sheets:
 * quotes are escaped, and a cell that starts with = + - or @ gets a leading
 * apostrophe so a spreadsheet cannot run it as a formula.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  return lines.join('\n') + '\n';
}
