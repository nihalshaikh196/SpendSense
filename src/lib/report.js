/**
 * @module report
 * @description Builds the downloadable monthly/yearly summary report.
 *
 * The CSV is "long" format — one fact per row, tagged with a section — so it
 * filters and pivots cleanly in any spreadsheet instead of being a picture of
 * a table. Each currency gets its own rows; nothing is summed across them.
 */

import {
  comparisonLabel,
  comparisonWindow,
  currencyBreakdown,
  dailySeries,
  elapsedDays,
  inCurrency,
  inPeriod,
  inRange,
  monthName,
  monthlySeries,
  peopleStats,
  percentChange,
  periodLabel,
  round2,
  shiftPeriod,
  summarize,
  todayString,
  topItems,
  trackingStart,
  wasTracked,
} from './analytics.js';
import { toCsv } from './csv.js';

export const SUMMARY_HEADERS = [
  'Section', 'Label', 'Currency', 'Amount', 'Count', 'Share %', 'Previous', 'Change %',
];

const pct = (n) => (n === null || !Number.isFinite(n) ? '' : Math.round(n * 10) / 10);

/**
 * @param {Object[]} expenses - The full expense history
 * @param {import('./analytics.js').Period} period
 * @param {string} [today]
 * @returns {Array<Array<string|number>>} Rows, header first
 */
export function buildSummaryRows(expenses, period, today = todayString()) {
  const rows = [SUMMARY_HEADERS];
  const trackedSince = trackingStart(expenses);
  const window = comparisonWindow(period, today);
  const compareName = comparisonLabel(window);
  // Previous/Change stay blank when the earlier stretch wasn't tracked —
  // "nothing logged" there means "not using the app yet", not zero spend.
  const comparable = wasTracked(window.start, trackedSince);
  const periodExpenses = inPeriod(expenses, period);
  const previousExpenses = comparable ? inRange(expenses, window.start, window.end) : [];

  for (const { currency } of currencyBreakdown(periodExpenses)) {
    const current = summarize(inCurrency(periodExpenses, currency));
    const previous = summarize(inCurrency(previousExpenses, currency));
    const prevByCat = new Map(previous.byCategory.map((c) => [c.category, c.total]));
    const share = (amount) => (current.total ? pct((amount / current.total) * 100) : '');

    rows.push([
      'Total', comparable ? `${periodLabel(period)} vs ${compareName}` : periodLabel(period), currency,
      current.total, current.count, 100,
      comparable ? previous.total : '',
      comparable ? pct(percentChange(current.total, previous.total)) : '',
    ]);

    for (const cat of current.byCategory) {
      const prev = prevByCat.get(cat.category) ?? 0;
      rows.push([
        'Category', cat.label, currency, cat.total, cat.count, share(cat.total),
        comparable ? prev : '',
        comparable ? pct(percentChange(cat.total, prev)) : '',
      ]);
    }

    const slice = inCurrency(periodExpenses, currency);
    if (period.type === 'month') {
      const elapsed = elapsedDays(period, today);
      for (const day of dailySeries(slice, period, today).slice(0, elapsed)) {
        const count = slice.filter((e) => e.date === day.date).length;
        rows.push(['Day', day.date, currency, day.total, count, share(day.total), '', '']);
      }
    } else {
      const lastYear = inCurrency(inPeriod(expenses, shiftPeriod(period, -1)), currency);
      const prevMonths = monthlySeries(lastYear, period.year - 1, today);
      for (const m of monthlySeries(slice, period.year, today)) {
        if (m.total === null) continue;
        const prev = prevMonths[m.month];
        const tracked = wasTracked(`${prev.key}-01`, trackedSince) || prev.total > 0;
        rows.push([
          'Month', `${monthName(m.month)} ${period.year}`, currency, m.total, m.count, share(m.total),
          tracked ? prev.total : '',
          tracked ? pct(percentChange(m.total, prev.total)) : '',
        ]);
      }
    }

    for (const item of topItems(slice, 10)) {
      rows.push(['Top item', item.label, currency, item.total, item.count, share(item.total), '', '']);
    }

    // Full bill values, not a split — see peopleStats.
    for (const person of peopleStats(slice)) {
      rows.push(['Shared with', person.name, currency, round2(person.total), person.count, '', '', '']);
    }
  }

  return rows;
}

export function buildSummaryCsv(expenses, period, today) {
  return toCsv(buildSummaryRows(expenses, period, today));
}
