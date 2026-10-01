/**
 * @module analytics
 * @description Pure aggregation helpers for the Dashboard and its reports.
 *
 * Everything here works on the in-memory expense list the ExpenseContext
 * already holds, so the dashboard never re-queries IndexedDB and can't drift
 * from what the Expenses page shows.
 *
 * Amounts are never summed across currencies: ₹500 + $50 is not 550 of
 * anything. Callers pick one currency and filter with `inCurrency` first;
 * `sumByCurrency` is the only helper that looks at several at once, and it
 * keeps them apart.
 */

import { getCategoryLabel } from './categories.js';

// ─── Numbers ──────────────────────────────────────────────────────────────────

/** Rounds to 2 decimal places to keep floating-point drift out of totals. */
export function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Relative change from `previous` to `current`, as a percentage.
 * @returns {number|null} null when there is no baseline to compare against
 */
export function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** Formats a Date as YYYY-MM-DD in local time. */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses YYYY-MM-DD as a local date. `new Date('2026-09-22')` is UTC
 * midnight, which reads back as the previous day west of UTC.
 */
export function parseDateString(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayString(now = new Date()) {
  return toDateString(now);
}

/** Shifts a YYYY-MM-DD string by `n` days (negative goes back). */
export function addDays(dateStr, n) {
  const d = parseDateString(dateStr);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

function daysBetweenInclusive(start, end) {
  const ms = parseDateString(end) - parseDateString(start);
  return Math.round(ms / 86_400_000) + 1;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

const MONTH_LONG = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString('en', { month: 'long' }),
);
const MONTH_SHORT = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString('en', { month: 'short' }),
);

export function monthName(month, style = 'long') {
  return (style === 'short' ? MONTH_SHORT : MONTH_LONG)[month];
}

/** "Mon, 14 Sep" — for naming a single day in prose. */
export function formatDay(dateStr) {
  return parseDateString(dateStr).toLocaleDateString('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * How a day reads in a list: "Today", "Yesterday", "Mon, Sep 21" — with the
 * year added only when it isn't this year.
 */
export function relativeDay(dateStr, today = todayString()) {
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  const d = parseDateString(dateStr);
  const sameYear = dateStr.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Periods ──────────────────────────────────────────────────────────────────

/**
 * A reporting period: one calendar month or one calendar year.
 * @typedef {{ type: 'month', year: number, month: number } | { type: 'year', year: number }} Period
 * `month` is 0-indexed, matching Date.
 */

/** @returns {Period} */
export function currentPeriod(type, now = new Date()) {
  return type === 'year'
    ? { type: 'year', year: now.getFullYear() }
    : { type: 'month', year: now.getFullYear(), month: now.getMonth() };
}

/** Moves a period forward or back by `delta` units of its own type. */
export function shiftPeriod(period, delta) {
  if (period.type === 'year') return { type: 'year', year: period.year + delta };
  const d = new Date(period.year, period.month + delta, 1);
  return { type: 'month', year: d.getFullYear(), month: d.getMonth() };
}

/** @returns {{ start: string, end: string, days: number }} inclusive bounds */
export function periodBounds(period) {
  if (period.type === 'year') {
    const start = `${period.year}-01-01`;
    const end = `${period.year}-12-31`;
    return { start, end, days: daysBetweenInclusive(start, end) };
  }
  const days = daysInMonth(period.year, period.month);
  const start = toDateString(new Date(period.year, period.month, 1));
  const end = toDateString(new Date(period.year, period.month, days));
  return { start, end, days };
}

export function periodLabel(period, style = 'long') {
  if (period.type === 'year') return String(period.year);
  return `${monthName(period.month, style)} ${period.year}`;
}

/** Stable key for a period: "2026-09" or "2026". Used in filenames and selects. */
export function periodKey(period) {
  if (period.type === 'year') return String(period.year);
  return `${period.year}-${String(period.month + 1).padStart(2, '0')}`;
}

/** Inverse of `periodKey`. */
export function periodFromKey(key) {
  const [y, m] = key.split('-').map(Number);
  return m ? { type: 'month', year: y, month: m - 1 } : { type: 'year', year: y };
}

export function samePeriod(a, b) {
  return periodKey(a) === periodKey(b) && a.type === b.type;
}

/**
 * How many days of the period have happened: all of them for a past period,
 * none for a future one, up to and including today for the current one.
 */
export function elapsedDays(period, today = todayString()) {
  const { start, end, days } = periodBounds(period);
  if (today < start) return 0;
  if (today > end) return days;
  return daysBetweenInclusive(start, today);
}

export function isInProgress(period, today = todayString()) {
  const { start, end } = periodBounds(period);
  return today >= start && today <= end;
}

/** True when the period starts after today — nothing can have happened yet. */
export function isFuture(period, today = todayString()) {
  return periodBounds(period).start > today;
}

/**
 * The slice of the previous period that's fair to compare against. A month
 * in progress is compared with the same number of days of the month before
 * ("Sep 1–14 vs Aug 1–14"), not the whole of August, which would make every
 * month look cheaper until its last day.
 *
 * @returns {{ period: Period, start: string, end: string, partial: boolean }}
 */
export function comparisonWindow(period, today = todayString()) {
  const previous = shiftPeriod(period, -1);
  const bounds = periodBounds(previous);
  if (!isInProgress(period, today)) {
    return { period: previous, start: bounds.start, end: bounds.end, partial: false };
  }
  const span = Math.min(elapsedDays(period, today), bounds.days);
  return {
    period: previous,
    start: bounds.start,
    end: addDays(bounds.start, span - 1),
    partial: span < bounds.days,
  };
}

/**
 * Every period of `type` that has at least one expense, newest first, plus
 * the current one so the list is never empty.
 * @returns {Period[]}
 */
export function periodsWithData(expenses, type, now = new Date()) {
  const keys = new Set([periodKey(currentPeriod(type, now))]);
  for (const e of expenses) {
    if (!e.date) continue;
    keys.add(type === 'year' ? e.date.slice(0, 4) : e.date.slice(0, 7));
  }
  return [...keys].sort().reverse().map(periodFromKey);
}

/**
 * The first day anything was logged, in any currency — or null with no data.
 * Before this date "no expenses" means "not tracking yet", not "spent
 * nothing", so it must never be compared against as if it were zero.
 */
export function trackingStart(expenses) {
  let first = null;
  for (const e of expenses) {
    if (e.date && (!first || e.date < first)) first = e.date;
  }
  return first;
}

/** Whether a window starting on `start` was fully tracked. */
export function wasTracked(start, trackedSince) {
  return Boolean(trackedSince) && trackedSince <= start;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export function inRange(expenses, start, end) {
  return expenses.filter((e) => e.date >= start && e.date <= end);
}

export function inPeriod(expenses, period) {
  const { start, end } = periodBounds(period);
  return inRange(expenses, start, end);
}

export function inCurrency(expenses, currency) {
  return expenses.filter((e) => (e.currency || 'INR') === currency);
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Totals kept apart per currency.
 * @returns {Record<string, number>} e.g. { INR: 12400, USD: 50 }
 */
export function sumByCurrency(expenses) {
  const totals = {};
  for (const e of expenses) {
    const code = e.currency || 'INR';
    totals[code] = (totals[code] || 0) + (e.amount || 0);
  }
  for (const code of Object.keys(totals)) totals[code] = round2(totals[code]);
  return totals;
}

/**
 * Per-currency totals and counts, most-used currency first. Sorted by count,
 * not total — comparing ₹ totals against $ totals says nothing.
 * @returns {Array<{ currency: string, total: number, count: number }>}
 */
export function currencyBreakdown(expenses) {
  const map = new Map();
  for (const e of expenses) {
    const code = e.currency || 'INR';
    const row = map.get(code) || { currency: code, total: 0, count: 0 };
    row.total += e.amount || 0;
    row.count += 1;
    map.set(code, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}

/**
 * The currency a view should open in: the preferred one if it has any data,
 * otherwise whichever currency is used most.
 */
export function pickCurrency(expenses, preferred) {
  if (expenses.some((e) => (e.currency || 'INR') === preferred)) return preferred;
  return currencyBreakdown(expenses)[0]?.currency ?? preferred;
}

// ─── Summaries ────────────────────────────────────────────────────────────────

/**
 * Headline numbers for a single-currency slice.
 * @returns {{
 *   total: number, count: number, largest: Object|null,
 *   byCategory: Array<{ category: string, label: string, total: number, count: number }>
 * }}
 */
export function summarize(expenses) {
  let total = 0;
  let largest = null;
  const cats = new Map();

  for (const e of expenses) {
    const amount = e.amount || 0;
    total += amount;
    if (!largest || amount > largest.amount) largest = e;

    const key = e.category || 'other';
    const row = cats.get(key) || { category: key, label: getCategoryLabel(key), total: 0, count: 0 };
    row.total += amount;
    row.count += 1;
    cats.set(key, row);
  }

  const byCategory = [...cats.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);

  return { total: round2(total), count: expenses.length, largest, byCategory };
}

// ─── Series ───────────────────────────────────────────────────────────────────

/**
 * One entry per day of a month, in order. Days after today are null so the
 * chart shows them as not-yet-happened rather than as zero spend.
 * @returns {Array<{ date: string, total: number|null }>}
 */
export function dailySeries(expenses, period, today = todayString()) {
  const { start, days } = periodBounds(period);
  const byDate = new Map();
  for (const e of expenses) byDate.set(e.date, (byDate.get(e.date) || 0) + (e.amount || 0));

  return Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    return { date, total: date > today ? null : round2(byDate.get(date) || 0) };
  });
}

/**
 * One entry per month of a year. Future months are null.
 * @returns {Array<{ month: number, key: string, total: number|null, count: number }>}
 */
export function monthlySeries(expenses, year, today = todayString()) {
  const rows = Array.from({ length: 12 }, (_, month) => ({
    month,
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    total: 0,
    count: 0,
  }));
  for (const e of expenses) {
    if (!e.date?.startsWith(`${year}-`)) continue;
    const row = rows[Number(e.date.slice(5, 7)) - 1];
    if (!row) continue;
    row.total += e.amount || 0;
    row.count += 1;
  }
  const currentKey = today.slice(0, 7);
  return rows.map((r) => ({ ...r, total: r.key > currentKey ? null : round2(r.total) }));
}

/**
 * Trailing moving average. Early points average over what exists so far
 * rather than pretending the days before the period were zero.
 */
export function rollingAverage(values, window = 7) {
  return values.map((v, i) => {
    if (v === null) return null;
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((x) => x !== null);
    return round2(slice.reduce((s, x) => s + x, 0) / slice.length);
  });
}

/** Running total; nulls (future points) stay null. */
export function cumulative(values) {
  let sum = 0;
  return values.map((v) => {
    if (v === null) return null;
    sum += v;
    return round2(sum);
  });
}

// ─── Items ────────────────────────────────────────────────────────────────────

/**
 * Collapses spelling noise so "Coffee", "coffee " and "2 coffee" group
 * together. Falls back to the category when the item is blank.
 */
export function itemKey(expense) {
  const key = String(expense.item || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return key || `(${expense.category || 'other'})`;
}

function itemLabel(key) {
  if (key.startsWith('(')) return getCategoryLabel(key.slice(1, -1));
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * What the money actually went on, grouped by normalized item.
 * @returns {Array<{ key: string, label: string, total: number, count: number }>}
 */
export function topItems(expenses, limit = 8) {
  const map = new Map();
  for (const e of expenses) {
    const key = itemKey(e);
    const row = map.get(key) || { key, label: itemLabel(key), total: 0, count: 0 };
    row.total += e.amount || 0;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total || b.count - a.count)
    .slice(0, limit);
}

/**
 * Things bought again and again lately, with the price usually paid — the
 * Home page offers them as one-tap shortcuts.
 *
 * Looks at the last `days` days and keeps items logged at least twice. The
 * amount is the most common price (ties go to the most recent), but only if
 * that price has actually repeated — lunch at a different price every day
 * gets no amount, so the user types it rather than accepting a guess. The
 * label is the item as last typed, so re-parsing it gives the same result.
 *
 * @returns {Array<{ key: string, label: string, amount: number|null, currency: string, category: string, count: number }>}
 */
export function frequentItems(expenses, today = todayString(), { days = 60, limit = 6 } = {}) {
  const since = addDays(today, -(days - 1));
  const groups = new Map();

  for (const e of expenses) {
    if (!e.date || e.date < since || e.date > today || !e.amount) continue;
    const key = itemKey(e);
    if (key.startsWith('(')) continue;
    const g = groups.get(key) || { key, count: 0, latest: null, amounts: new Map() };
    g.count += 1;
    const newer = !g.latest || e.date > g.latest.date || (e.date === g.latest.date && (e.createdAt || 0) > (g.latest.createdAt || 0));
    if (newer) g.latest = e;
    const amountKey = `${e.currency || 'INR'}|${e.amount}`;
    const a = g.amounts.get(amountKey) || { count: 0, last: '' };
    a.count += 1;
    if (e.date > a.last) a.last = e.date;
    g.amounts.set(amountKey, a);
    groups.set(key, g);
  }

  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || b.latest.date.localeCompare(a.latest.date))
    .slice(0, limit)
    .map((g) => {
      const [amountKey, top] = [...g.amounts].sort(
        ([, x], [, y]) => y.count - x.count || y.last.localeCompare(x.last),
      )[0];
      const [currency, amount] = amountKey.split('|');
      return {
        key: g.key,
        label: String(g.latest.item).trim(),
        amount: top.count >= 2 ? Number(amount) : null,
        currency,
        category: g.latest.category || 'other',
        count: g.count,
      };
    });
}

// ─── People ───────────────────────────────────────────────────────────────────

/**
 * Who shows up on your expenses, and the full value of the bills they were
 * on. Deliberately not a split: SpendSense doesn't record who paid or how a
 * bill was divided, so dividing it here would present a guess as a debt.
 *
 * @returns {Array<{ name: string, count: number, total: number }>}
 */
export function peopleStats(expenses) {
  const map = new Map();
  for (const e of expenses) {
    for (const person of e.people || []) {
      const name = String(person).trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const row = map.get(key) || { name, count: 0, total: 0 };
      row.count += 1;
      row.total += e.amount || 0;
      map.set(key, row);
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.count - a.count || b.total - a.total);
}

// ─── Recurring ────────────────────────────────────────────────────────────────

/** Words that mark a commitment rather than a choice, even on first sight. */
const RECURRING_WORDS = new Set([
  'rent', 'emi', 'loan', 'insurance', 'subscription', 'netflix', 'spotify',
  'prime', 'hotstar', 'wifi', 'broadband', 'internet', 'electricity',
  'maintenance', 'gym', 'postpaid', 'recharge', 'dth', 'sip', 'society',
]);

/**
 * Item keys that repeat month after month at the same price: seen in at
 * least two months, about once a month, with amounts within 10% of each
 * other. Daily coffee fails the once-a-month test; a movie at a different
 * price each time fails the price test.
 *
 * @param {Object[]} expenses - Full history in one currency
 * @returns {Set<string>}
 */
export function detectRecurringKeys(expenses) {
  const groups = new Map();
  for (const e of expenses) {
    const key = itemKey(e);
    if (key.startsWith('(')) continue;
    const g = groups.get(key) || { months: new Set(), amounts: [] };
    g.months.add(e.date.slice(0, 7));
    g.amounts.push(e.amount || 0);
    groups.set(key, g);
  }

  const keys = new Set();
  for (const [key, { months, amounts }] of groups) {
    if (months.size < 2 || amounts.length > months.size + 1) continue;
    const mid = median(amounts);
    if (mid > 0 && (Math.max(...amounts) - Math.min(...amounts)) / mid <= 0.1) keys.add(key);
  }
  return keys;
}

/** Bills, known subscription words, or a detected monthly repeat. */
export function isRecurring(expense, recurringKeys) {
  if (expense.category === 'bills') return true;
  const key = itemKey(expense);
  if (recurringKeys.has(key)) return true;
  return key.split(' ').some((w) => RECURRING_WORDS.has(w));
}

/**
 * Splits a slice into recurring commitments and everyday spending.
 * @returns {{ recurring: number, variable: number, recurringItems: Array<{ label: string, total: number }> }}
 */
export function recurringSplit(expenses, recurringKeys) {
  let recurring = 0;
  let variable = 0;
  const items = new Map();
  for (const e of expenses) {
    const amount = e.amount || 0;
    if (isRecurring(e, recurringKeys)) {
      recurring += amount;
      const key = itemKey(e);
      items.set(key, (items.get(key) || 0) + amount);
    } else {
      variable += amount;
    }
  }
  const recurringItems = [...items]
    .map(([key, total]) => ({ label: itemLabel(key), total: round2(total) }))
    .sort((a, b) => b.total - a.total);
  return { recurring: round2(recurring), variable: round2(variable), recurringItems };
}

// ─── Day-level stats ──────────────────────────────────────────────────────────

/**
 * Cheap, high-value numbers over the days of a period that have happened.
 *
 * @param {Object[]} expenses    - The period's expenses in one currency
 * @param {Period}   period
 * @param {Object[]} allInPeriod - The period's expenses in every currency.
 *   A no-spend day is a day with no spending at all, whatever the currency.
 * @returns {{
 *   elapsed: number, dailyAverage: number,
 *   busiestDay: { date: string, total: number } | null,
 *   noSpendDays: number,
 *   weekdayAverage: number|null, weekendAverage: number|null
 * }}
 */
export function dayStats(expenses, period, allInPeriod = expenses, today = todayString()) {
  const elapsed = elapsedDays(period, today);
  const { start } = periodBounds(period);

  const byDate = new Map();
  for (const e of expenses) byDate.set(e.date, (byDate.get(e.date) || 0) + (e.amount || 0));
  const anySpend = new Set(allInPeriod.map((e) => e.date));

  let busiestDay = null;
  let noSpendDays = 0;
  const weekday = { total: 0, days: 0 };
  const weekend = { total: 0, days: 0 };
  let total = 0;

  for (let i = 0; i < elapsed; i++) {
    const date = addDays(start, i);
    const spent = byDate.get(date) || 0;
    total += spent;
    if (!anySpend.has(date)) noSpendDays += 1;
    if (spent > 0 && (!busiestDay || spent > busiestDay.total)) busiestDay = { date, total: round2(spent) };

    const dow = parseDateString(date).getDay();
    const bucket = dow === 0 || dow === 6 ? weekend : weekday;
    bucket.total += spent;
    bucket.days += 1;
  }

  return {
    elapsed,
    dailyAverage: elapsed ? round2(total / elapsed) : 0,
    busiestDay,
    noSpendDays,
    weekdayAverage: weekday.days ? round2(weekday.total / weekday.days) : null,
    weekendAverage: weekend.days ? round2(weekend.total / weekend.days) : null,
  };
}

/**
 * Projected total for a period in progress. Recurring costs are counted once
 * — rent paid on the 1st shouldn't be extrapolated across 30 days — and only
 * everyday spending is projected at its current daily rate.
 *
 * @returns {number|null} null when there's nothing to project from
 */
export function projectTotal({ recurring, variable, elapsed, days }) {
  if (!elapsed || elapsed >= days) return null;
  return round2(recurring + (variable / elapsed) * days);
}

/**
 * Names a comparison window for a label: "August 2026" for a whole month,
 * "Aug 1–23" for the matching slice of one, "Jan 1 – Sep 23, 2025" for a
 * slice of a year.
 */
export function comparisonLabel({ period, start, end, partial }) {
  if (!partial) return periodLabel(period);
  const s = parseDateString(start);
  const e = parseDateString(end);
  const short = (d) => `${monthName(d.getMonth(), 'short')} ${d.getDate()}`;
  if (period.type === 'year') return `${short(s)} – ${short(e)}, ${period.year}`;
  return `${short(s)}–${e.getDate()}`;
}

/** Inclusive day count between two YYYY-MM-DD strings. */
export function spanDays(start, end) {
  return daysBetweenInclusive(start, end);
}
