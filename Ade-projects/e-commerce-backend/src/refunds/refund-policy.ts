/**
 * The refund rules in one place (see docs/REFUND_POLICY.md).
 * Pure functions: no database, no clock of their own.
 */
export type RefundType = 'DEFECT' | 'CANCELLATION';
export type Resolution = 'REFUND' | 'REPLACEMENT';

export interface RefundPolicyConfig {
  /** Hours after delivery in which a refund or a replacement can be asked for. */
  refundHours: number;
  /** Hours after delivery in which a replacement can still be asked for. */
  replacementHours: number;
  /** Percent of the money returned when the order is cancelled before it arrives. */
  cancellationPercent: number;
}

export const DEFAULT_POLICY: RefundPolicyConfig = {
  refundHours: 24,
  replacementHours: 72,
  cancellationPercent: 65,
};

const HOUR = 60 * 60 * 1000;

/** What a damaged, faulty or wrong item can be exchanged for, given the time since delivery. */
export function allowedResolutions(
  deliveredAt: Date,
  now: Date,
  policy: RefundPolicyConfig = DEFAULT_POLICY,
): Resolution[] {
  const elapsed = now.getTime() - deliveredAt.getTime();
  if (elapsed < 0) return [];
  if (elapsed <= policy.refundHours * HOUR) return ['REFUND', 'REPLACEMENT'];
  if (elapsed <= policy.replacementHours * HOUR) return ['REPLACEMENT'];
  return [];
}

/** Money returned, in the smallest unit (kobo). Never more than was paid. */
export function refundAmountMinor(
  type: RefundType,
  paidMajor: number,
  policy: RefundPolicyConfig = DEFAULT_POLICY,
): number {
  const paidMinor = Math.round(paidMajor * 100);
  if (type === 'DEFECT') return paidMinor;
  const percent = Math.min(Math.max(policy.cancellationPercent, 0), 100);
  return Math.floor((paidMinor * percent) / 100);
}
