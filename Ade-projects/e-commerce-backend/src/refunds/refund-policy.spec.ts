import {
  allowedResolutions,
  DEFAULT_POLICY,
  refundAmountMinor,
} from './refund-policy';

const delivered = new Date('2026-01-10T12:00:00Z');
const after = (hours: number) => new Date(delivered.getTime() + hours * 3600_000);

describe('allowedResolutions', () => {
  it('allows a refund or a replacement within 24 hours', () => {
    expect(allowedResolutions(delivered, after(1))).toEqual(['REFUND', 'REPLACEMENT']);
    expect(allowedResolutions(delivered, after(24))).toEqual(['REFUND', 'REPLACEMENT']);
  });

  it('allows only a replacement between 24 and 72 hours', () => {
    expect(allowedResolutions(delivered, after(24.01))).toEqual(['REPLACEMENT']);
    expect(allowedResolutions(delivered, after(72))).toEqual(['REPLACEMENT']);
  });

  it('allows nothing after 72 hours', () => {
    expect(allowedResolutions(delivered, after(72.01))).toEqual([]);
  });

  it('allows nothing for a delivery date in the future', () => {
    expect(allowedResolutions(delivered, after(-1))).toEqual([]);
  });

  it('follows the configured windows', () => {
    const policy = { ...DEFAULT_POLICY, refundHours: 2, replacementHours: 4 };
    expect(allowedResolutions(delivered, after(3), policy)).toEqual(['REPLACEMENT']);
    expect(allowedResolutions(delivered, after(5), policy)).toEqual([]);
  });
});

describe('refundAmountMinor', () => {
  it('returns everything for a damaged or faulty item', () => {
    expect(refundAmountMinor('DEFECT', 15000)).toBe(1_500_000);
  });

  it('returns 65 percent when the order is cancelled before it arrives', () => {
    expect(refundAmountMinor('CANCELLATION', 10000)).toBe(650_000);
  });

  it('rounds down so the shop never pays out more than the rule', () => {
    expect(refundAmountMinor('CANCELLATION', 0.07)).toBe(4);
  });

  it('never goes above the amount paid', () => {
    const policy = { ...DEFAULT_POLICY, cancellationPercent: 150 };
    expect(refundAmountMinor('CANCELLATION', 100, policy)).toBe(10_000);
  });
});
