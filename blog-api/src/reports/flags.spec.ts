import { evaluateFlags, FlagThresholds, isOffHours } from './flags';

const t: FlagThresholds = {
  deletes: 10,
  lookups: 20,
  offHoursStart: 22,
  offHoursEnd: 6,
  tzOffsetHours: 1,
};

describe('isOffHours', () => {
  it('handles quiet hours that run past midnight, in the report time zone', () => {
    expect(isOffHours(new Date('2026-01-01T21:30:00Z'), t)).toBe(true); // 22:30 local
    expect(isOffHours(new Date('2026-01-01T03:00:00Z'), t)).toBe(true); // 04:00 local
    expect(isOffHours(new Date('2026-01-01T12:00:00Z'), t)).toBe(false);
    expect(isOffHours(new Date('2026-01-01T05:00:00Z'), t)).toBe(false); // 06:00 local
  });

  it('handles a same-day window', () => {
    const day = { ...t, offHoursStart: 1, offHoursEnd: 5, tzOffsetHours: 0 };
    expect(isOffHours(new Date('2026-01-01T02:00:00Z'), day)).toBe(true);
    expect(isOffHours(new Date('2026-01-01T06:00:00Z'), day)).toBe(false);
  });
});

describe('evaluateFlags', () => {
  const base = { counts: {}, offHoursActions: 0, twoFactorEnabled: true, thresholds: t };

  it('flags nothing for a normal period', () => {
    expect(evaluateFlags(base)).toEqual([]);
  });

  it('flags many deletes and lookups at the threshold', () => {
    const flags = evaluateFlags({
      ...base,
      counts: { 'post.remove': 6, 'user.delete': 4, 'user.view_posts': 20 },
    });
    expect(flags).toEqual([
      'many deletes (10)',
      "many lookups of other people's content (20)",
    ]);
  });

  it('flags off-hours work and missing 2FA', () => {
    expect(evaluateFlags({ ...base, offHoursActions: 3, twoFactorEnabled: false })).toEqual([
      'off-hours activity (3)',
      'no two-factor authentication',
    ]);
  });
});
