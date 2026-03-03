/**
 * Utilidades compartidas para el import CSV
 */

export const SPANISH_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

export function parseSpanishDate(str: string): Date | null {
  const m = str.trim().match(/^(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/i);
  if (!m) return null;
  const month = SPANISH_MONTHS[m[2].toLowerCase()];
  if (month == null) return null;
  const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

export function parseAmount(str: string): number | null {
  const s = String(str || '').trim().replace(/\s/g, '').replace(/\$/g, '').replace(/,/g, '');
  if (!s) return null;
  const neg = /^-/.test(s) || s.startsWith('-$');
  const num = parseFloat(s.replace(/^-\$?/, '').replace(/^\$?/, ''));
  if (isNaN(num)) return null;
  return neg ? -num : num;
}

export function isTrasladoBancos(accountAmounts: { amount: number }[]): boolean {
  const totalSum = accountAmounts.reduce((s, a) => s + a.amount, 0);
  const totalAbs = accountAmounts.reduce((s, a) => s + Math.abs(a.amount), 0);
  return accountAmounts.length >= 2 && (
    Math.abs(totalSum) < 0.02 || (totalAbs > 0 && Math.abs(totalSum) / totalAbs < 0.005)
  );
}
