import { evaluateFlags, FlagThresholds, isOffHours, sumActions } from './flags';

const thresholds: FlagThresholds = { deletes: 3, lookups: 2, offHoursStart: 22, offHoursEnd: 6, tzOffsetHours: 1 };

describe('staff flags', () => {
  it('knows quiet hours that run past midnight, in the report time zone', () => {
    expect(isOffHours(new Date('2026-01-01T22:30:00Z'), thresholds)).toBe(true);
    expect(isOffHours(new Date('2026-01-01T02:00:00Z'), thresholds)).toBe(true);
    expect(isOffHours(new Date('2026-01-01T10:00:00Z'), thresholds)).toBe(false);
    expect(isOffHours(new Date('2026-01-01T21:30:00Z'), thresholds)).toBe(true);
    expect(isOffHours(new Date('2026-01-01T20:30:00Z'), thresholds)).toBe(false);
  });

  it('adds up chosen actions', () => {
    expect(sumActions({ 'user.delete': 2, 'wallet.reverse': 1, other: 9 }, ['user.delete', 'wallet.reverse'])).toBe(3);
  });

  it('flags removals, lookups, off-hours work and a missing second factor', () => {
    const flags = evaluateFlags({
      counts: { 'product.delete': 3, 'user.view': 2 },
      offHoursActions: 1,
      twoFactorEnabled: false,
      thresholds,
    });
    expect(flags).toHaveLength(4);
    expect(evaluateFlags({ counts: {}, offHoursActions: 0, twoFactorEnabled: true, thresholds })).toEqual([]);
  });
});
