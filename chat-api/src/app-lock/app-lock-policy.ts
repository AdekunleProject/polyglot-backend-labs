export const FAILS_PER_LOCKOUT = 5;
export const FAILS_BEFORE_SIGN_OUT = 10;

/** Seconds to wait after the nth consecutive wrong guess: nothing until the 5th, then 30s, doubling, at most 15 minutes. */
export function lockoutSeconds(failures: number): number {
  if (failures < FAILS_PER_LOCKOUT || failures % FAILS_PER_LOCKOUT !== 0) return 0;
  const round = failures / FAILS_PER_LOCKOUT;
  return Math.min(30 * 2 ** (round - 1), 15 * 60);
}

/** A passcode that is only one repeated character or a straight run is too easy to guess. */
export function isWeakPasscode(code: string): boolean {
  if (/^(.)\1+$/.test(code)) return true;
  if (!/^\d+$/.test(code)) return false;
  const digits = [...code].map(Number);
  const step = digits[1] - digits[0];
  return Math.abs(step) === 1 && digits.every((d, i) => i === 0 || d - digits[i - 1] === step);
}
