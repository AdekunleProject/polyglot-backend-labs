/** The id of a Mongoose document or plain object, as text. */
export function idOf(doc: unknown): string {
  const value = doc as { id?: unknown; _id?: unknown } | null | undefined;
  return String(value?.id ?? value?._id ?? '');
}

/** Copies the named fields, so an audit entry holds only what was meant to be kept. */
export function pick(doc: unknown, keys: string[]): Record<string, unknown> {
  const source = (doc ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}
