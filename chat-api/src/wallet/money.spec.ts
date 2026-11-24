import { formatNaira, limitFrom } from './money';

describe('money', () => {
  it('formats kobo as naira', () => {
    expect(formatNaira(150000)).toBe('₦1,500.00');
    expect(formatNaira(5)).toBe('₦0.05');
    expect(formatNaira(100)).toBe('₦1.00');
    expect(formatNaira(123456789)).toBe('₦1,234,567.89');
    expect(formatNaira(-250)).toBe('-₦2.50');
  });

  it('reads limits and falls back when the setting is missing or wrong', () => {
    expect(limitFrom('5000', 1)).toBe(5000);
    expect(limitFrom(undefined, 7)).toBe(7);
    expect(limitFrom('abc', 7)).toBe(7);
    expect(limitFrom('-5', 7)).toBe(7);
    expect(limitFrom('1.5', 7)).toBe(7);
  });
});
