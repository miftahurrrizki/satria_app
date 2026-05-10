/**
 * Shared date utilities — SATRIA frontend.
 *
 * Root issue:
 *   JavaScript parses bare date strings like '2026-05-10' as **UTC midnight**.
 *   In WIB (UTC+7) that resolves to 2026-05-09T17:00 local time, so dates
 *   display one day earlier than expected.
 *
 * Fix:
 *   Always parse YYYY-MM-DD strings with the `new Date(y, m-1, d)` constructor
 *   which uses LOCAL midnight — no timezone shift.
 *   Full ISO timestamps (containing 'T' or space) already carry timezone info
 *   so they are left to the JS engine.
 */

/**
 * Parse a date string as LOCAL time.
 * - `'2026-05-10'`              → `new Date(2026, 4, 10)` (local midnight) ✅
 * - `'2026-05-10T07:00:00Z'`   → `new Date(...)` as-is ✅
 */
export function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (s.includes('T') || s.includes(' ')) {
    // Full timestamp — engine handles timezone correctly
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parts = s.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d); // LOCAL midnight, zero UTC shift
}

/**
 * Format a date/datetime string for display in Indonesian locale.
 *
 * @param d       Raw string from API (YYYY-MM-DD or ISO timestamp)
 * @param options Intl.DateTimeFormatOptions — defaults to dd MMM yyyy
 * @param fallback String returned when `d` is empty/invalid — defaults to '—'
 */
export function fmtDateId(
  d: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
  fallback = '—',
): string {
  const parsed = parseLocalDate(d ?? '');
  if (!parsed || Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString('id-ID', options);
}

/**
 * Convert any date/timestamp string to a `YYYY-MM-DD` string in LOCAL time.
 * Safe to use as the `value` prop of `<input type="date">`.
 *
 * Problem with naive `.slice(0, 10)`:
 *   API returns `"2026-03-24T17:00:00.000Z"` (= WIB midnight 25 Mar).
 *   `.slice(0, 10)` → `"2026-03-24"` → input shows 24 Mar ✗
 *
 * This helper parses via `parseLocalDate` first, then reformats using local
 *   getFullYear/getMonth/getDate → always returns the correct local date.
 */
export function toInputDate(s: string | null | undefined): string {
  if (!s) return '';
  const d = parseLocalDate(s);
  if (!d || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Return true if a date-only deadline has already passed AND status ≠ 'selesai'.
 * Compares against local midnight today to avoid off-by-one from UTC parsing.
 */
export function isOverdue(
  deadline: string | null | undefined,
  status: string,
): boolean {
  if (!deadline || status === 'selesai') return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = parseLocalDate(deadline);
  if (!d) return false;
  return d.getTime() < today.getTime();
}
