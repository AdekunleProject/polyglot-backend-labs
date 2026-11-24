/** Cursor paging: the app sends back the opaque `nextCursor` it was given. */
export function encodeCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64url');
}

/** Returns the id behind a cursor, or null when it is not one of ours. */
export function decodeCursor(cursor: string): number | null {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  return /^\d{1,12}$/.test(text) ? Number(text) : null;
}
