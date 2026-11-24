/**
 * TypeORM answers UPDATE ... RETURNING with [rows, affectedCount], but an
 * INSERT ... RETURNING or a SELECT with just the rows. This accepts both.
 */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as T[];
  }
  return result as T[];
}
