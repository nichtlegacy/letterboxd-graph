/**
 * Resolving the `years` option
 *
 * A literal list is fine until the year turns over: a workflow pinned to
 * "2026,2025" quietly keeps drawing last year's graph every day of 2027, and
 * nothing about the run looks wrong. `last N` says what was meant instead.
 */

const RELATIVE = /^last[\s-]*(\d+)$/;

/**
 * Turn the `years` option into the list of years to draw, newest first.
 *
 * - empty — the current year
 * - `last N` — the current year and the N-1 before it, so `last 2` is this year
 *   and last year, whatever year it is when the run happens
 * - `2026,2025` — exactly those, in the order given
 *
 * @param {string|number|null} value - The option as written
 * @param {Date} now - Clock, injectable so the tests do not drift
 * @returns {Array<number>} Years, at least one
 */
export function resolveYears(value, now = new Date()) {
  const current = now.getUTCFullYear();
  const spec = String(value ?? '').trim().toLowerCase();

  if (!spec) return [current];

  const relative = RELATIVE.exec(spec);
  if (relative) {
    const count = Math.max(1, Number.parseInt(relative[1], 10));
    return Array.from({ length: count }, (_, index) => current - index);
  }

  const explicit = spec
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((year) => Number.isInteger(year));

  // An unreadable value falls back to the current year rather than failing the
  // run: the graph is worth more than the typo is worth stopping for.
  return explicit.length > 0 ? [...new Set(explicit)] : [current];
}
