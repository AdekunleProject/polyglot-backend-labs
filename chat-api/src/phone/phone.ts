/**
 * One spelling per number: E.164, "+" and digits. "0803 123 4567" becomes
 * "+2348031234567" when the default country code is 234.
 */
export function normalizePhone(input: string, defaultCountryCode = '234'): string | null {
  let text = input.trim().replace(/[\s\-().]/g, '');
  if (text.startsWith('00')) text = `+${text.slice(2)}`;
  else if (text.startsWith('0')) text = `+${defaultCountryCode}${text.slice(1)}`;
  return /^\+[1-9]\d{7,14}$/.test(text) ? text : null;
}

/** "+2348031234567" becomes "+234•••••4567" for logs and alerts. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)}${'•'.repeat(Math.max(phone.length - 8, 1))}${phone.slice(-4)}`;
}
