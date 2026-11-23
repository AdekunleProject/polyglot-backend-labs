export interface FlagThresholds {
  deletes: number;
  lookups: number;
  offHoursStart: number;
  offHoursEnd: number;
  tzOffsetHours: number;
}

export const DELETE_ACTIONS = ['user.delete', 'post.remove', 'comment.remove'];
export const LOOKUP_ACTIONS = ['user.view_posts', 'user.view_comments'];

/** True when the time falls in the quiet hours (which may run past midnight) in the report's time zone. */
export function isOffHours(
  at: Date,
  t: Pick<FlagThresholds, 'offHoursStart' | 'offHoursEnd' | 'tzOffsetHours'>,
): boolean {
  const hour = (at.getUTCHours() + t.tzOffsetHours + 24) % 24;
  return t.offHoursStart > t.offHoursEnd
    ? hour >= t.offHoursStart || hour < t.offHoursEnd
    : hour >= t.offHoursStart && hour < t.offHoursEnd;
}

export function sumActions(counts: Record<string, number>, actions: string[]): number {
  return actions.reduce((total, action) => total + (counts[action] ?? 0), 0);
}

/** What deserves a second look about one staff member's period. */
export function evaluateFlags(input: {
  counts: Record<string, number>;
  offHoursActions: number;
  twoFactorEnabled: boolean;
  thresholds: FlagThresholds;
}): string[] {
  const { counts, offHoursActions, twoFactorEnabled, thresholds } = input;
  const flags: string[] = [];
  const deletes = sumActions(counts, DELETE_ACTIONS);
  if (deletes >= thresholds.deletes) flags.push(`many deletes (${deletes})`);
  const lookups = sumActions(counts, LOOKUP_ACTIONS);
  if (lookups >= thresholds.lookups) flags.push(`many lookups of other people's content (${lookups})`);
  if (offHoursActions > 0) flags.push(`off-hours activity (${offHoursActions})`);
  if (!twoFactorEnabled) flags.push('no two-factor authentication');
  return flags;
}
