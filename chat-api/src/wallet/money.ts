/** 150000 kobo is "₦1,500.00". Money is always whole kobo inside the app. */
export function formatNaira(kobo: number): string {
  const sign = kobo < 0 ? '-' : '';
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}₦${naira}.${String(abs % 100).padStart(2, '0')}`;
}

/** An integer from the environment, else the default. */
export function limitFrom(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
