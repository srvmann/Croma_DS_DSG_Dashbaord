/**
 * Shared number-formatting helpers used across every dashboard tab.
 * Centralise here so all pages render amounts and percentages identically —
 * a single change here propagates everywhere.
 */

/**
 * Format an Indian-Rupee amount with magnitude suffixes:
 *   ≥ 1 Cr  →  ₹X.XXCr
 *   ≥ 1 L   →  ₹X.XXL
 *   ≥ 1 K   →  ₹X.XK
 *   otherwise → ₹X
 *
 * Negative values receive a minus sign before the ₹ symbol, not after.
 */
export function fmtInr(n: number): string {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(0)}`
}

/**
 * Format a number as a signed percentage string.
 *
 * @param n        - the value to format (e.g. 12.34 → '+12.3%', -5.678 → '-5.7%')
 * @param decimals - number of decimal places (default 1)
 */
export function fmtPct(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}
