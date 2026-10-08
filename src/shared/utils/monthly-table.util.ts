/**
 * Naming and time-zone rules for the monthly checkbox archive.
 *
 * The archiving job moves rows out of the live `checkbox` table into monthly
 * tables in the `history` schema. Both the name of those tables and the time
 * zone the period is interpreted in live here, so that a reader and the
 * archiver can never disagree about where a month's rows are, nor a query's
 * filter disagree with the timestamp it displays.
 */

/** Schema holding the monthly archive tables. */
export const HISTORY_SCHEMA = 'history';

/** Live transactional table, always a valid source for any period. */
export const LIVE_CHECKBOX_TABLE = 'checkbox';

/**
 * Time zone the business operates in.
 *
 * `createdAt` is stored in UTC, so any period filter must convert before
 * comparing. Filtering the raw UTC value while displaying the converted one
 * puts rows recorded near a month boundary (19:00-23:59 local, which is the
 * next day in UTC) into the wrong month.
 */
export const BUSINESS_TIME_ZONE = 'America/Guayaquil';

/** `createdAt` expressed in [BUSINESS_TIME_ZONE], for both filter and display. */
export const LOCAL_CREATED_AT = `cb."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE '${BUSINESS_TIME_ZONE}'`;

/**
 * Formats a month as the zero-padded two-digit string the archiving job uses
 * (`to_char(..., 'YYYY_MM')`).
 *
 * @param month Month number (1-12).
 * @returns Two-digit month string (3 -> "03").
 */
export function padMonth(month: number): string {
    return String(month).padStart(2, '0');
}

/**
 * Builds the schema-qualified name of a monthly checkbox archive table.
 *
 * @param year Four-digit year.
 * @param month Month number (1-12).
 * @returns Quoted, schema-qualified name, e.g. `history."2026_08_checkbox"`.
 */
export function buildMonthlyCheckboxTable(year: number, month: number): string {
    return `${HISTORY_SCHEMA}."${year}_${padMonth(month)}_${LIVE_CHECKBOX_TABLE}"`;
}
