/**
 * Money in the CMS (spec §6.3, PAY-02).
 *
 * The API speaks major units as JSON numbers with at most two decimals (`1500.5` means
 * PKR 1,500.50: `gymsera_be/src/utils/money.utils.js#toMajorUnitsNumber`). Anything the
 * browser has to compare or hold is turned into an integer count of minor units first, so no
 * float arithmetic ever touches an amount; the number is only formatted at display and only
 * converted back to major units to put it on the wire.
 *
 * The browser never adds up amounts the server already totals.
 */

const MINOR_PER_MAJOR = 100

/** A server amount (number or numeric string) as integer minor units; null when it is not a number. */
export function toMinor(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    const text = value.trim()
    if (!/^-?\d+(\.\d+)?$/.test(text)) return null
    const negative = text.startsWith('-')
    const [whole, fraction = ''] = text.replace('-', '').split('.')
    // Round half up on the third decimal, in integers.
    const cents = Number(whole) * MINOR_PER_MAJOR + Number((fraction + '00').slice(0, 2)) + (Number(fraction[2] ?? 0) >= 5 ? 1 : 0)
    return negative ? -cents : cents
  }
  if (!Number.isFinite(value)) return null
  return Math.round(value * MINOR_PER_MAJOR)
}

/**
 * What a person typed into an amount box, as minor units. Accepts thousands separators and
 * at most two decimals; anything else is null (the caller shows its own message).
 */
export function parseAmountInput(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return toMinor(cleaned)
}

/** Minor units as the number the API expects (two decimals at most). */
export function toApiAmount(minor: number): number {
  return minor / MINOR_PER_MAJOR
}

/** Display only. Whole amounts show no decimals; amounts with paisa show both. */
export function formatMinor(minor: number | null | undefined, currency = 'PKR'): string {
  if (minor === null || minor === undefined) return '—'
  const hasFraction = minor % MINOR_PER_MAJOR !== 0
  const major = minor / MINOR_PER_MAJOR
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency,
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(major)
  } catch {
    return `${currency} ${major.toFixed(hasFraction ? 2 : 0)}`
  }
}

/** A server amount, formatted for display; "—" when the server sent nothing usable. */
export function formatMoney(value: number | string | null | undefined, currency = 'PKR'): string {
  return formatMinor(toMinor(value), currency)
}
