/**
 * Core utilities for the 21st-of-previous-month to 20th-of-current-month custom calendar cycle.
 */

/**
 * Smart helper to extract calendar year, 0-indexed month, and day timezone-agnostically.
 * Distinguishes UTC midnight dates (from Mongoose/ISO string) from local date objects (from setHours/UI).
 */
export function extractDateParts(dateInput: Date | string | number): { year: number; month: number; d: number } {
  const date = new Date(dateInput);
  let year: number;
  let month: number; // 0-indexed
  let d: number;

  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}/)) {
    const parts = dateInput.split('T')[0].split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    d = parseInt(parts[2], 10);
  } else {
    // If UTC time represents exactly midnight, it is a UTC date from DB or ISO string parsing.
    if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0) {
      year = date.getUTCFullYear();
      month = date.getUTCMonth();
      d = date.getUTCDate();
    } else {
      // If it has local time hours (like a local Date or setHours(0,0,0,0)), local getters preserve the date.
      year = date.getFullYear();
      month = date.getMonth();
      d = date.getDate();
    }
  }

  return { year, month, d };
}

/**
 * Converts a date into a cycle identifier string (e.g., '2026-05' for the cycle ending on May 20, 2026).
 * Any day on or after the 21st belongs to the next month's cycle.
 */
export function toCycleKey(dateInput: Date | string | number): string {
  const { year, month, d } = extractDateParts(dateInput);

  if (d >= 21) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
  } else {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }
}

/**
 * Returns the exact starting and ending Date bounds for a specific cycle (specified by year and 1-indexed month).
 * For example, getCycleBounds(2026, 5) yields:
 *   startDate: 2026-04-21T00:00:00.000Z
 *   endDate:   2026-05-20T23:59:59.999Z
 */
export function getCycleBounds(cycleYear: number, cycleMonth: number): { startDate: Date; endDate: Date } {
  // cycleMonth is 1-indexed (1 = Jan, ..., 12 = Dec)
  const monthIndex = cycleMonth - 1; // 0-indexed
  
  // Start is 21st of the previous month
  const startYear = monthIndex === 0 ? cycleYear - 1 : cycleYear;
  const startMonth = monthIndex === 0 ? 11 : monthIndex - 1;
  const startDate = new Date(Date.UTC(startYear, startMonth, 21, 0, 0, 0, 0));
  
  // End is 20th of the cycle month
  const endDate = new Date(Date.UTC(cycleYear, monthIndex, 20, 23, 59, 59, 999));
  
  return { startDate, endDate };
}

/**
 * Returns the cycle boundaries and cycle metadata that any arbitrary date belongs to.
 */
export function getCycleBoundsForDate(dateInput: Date | string | number): {
  startDate: Date;
  endDate: Date;
  cycleMonth: number; // 1-indexed
  cycleYear: number;
} {
  const { year, month, d } = extractDateParts(dateInput);
  
  let cycleMonth: number;
  let cycleYear: number;
  
  if (d >= 21) {
    cycleMonth = month === 11 ? 1 : month + 2;
    cycleYear = month === 11 ? year + 1 : year;
  } else {
    cycleMonth = month + 1;
    cycleYear = year;
  }
  
  const { startDate, endDate } = getCycleBounds(cycleYear, cycleMonth);
  return { startDate, endDate, cycleMonth, cycleYear };
}
