import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addDays,
  frequentItems,
  greetingFor,
  relativeDay,
  comparisonLabel,
  comparisonWindow,
  cumulative,
  currencyBreakdown,
  dailySeries,
  dayStats,
  detectRecurringKeys,
  elapsedDays,
  inCurrency,
  inPeriod,
  isRecurring,
  itemKey,
  monthlySeries,
  peopleStats,
  percentChange,
  periodBounds,
  periodFromKey,
  periodKey,
  periodsWithData,
  pickCurrency,
  trackingStart,
  wasTracked,
  projectTotal,
  recurringSplit,
  rollingAverage,
  shiftPeriod,
  sumByCurrency,
  summarize,
  topItems,
} from '../src/lib/analytics.js';
import { formatTotals } from '../src/lib/currency.js';

let seq = 0;
const exp = (date, amount, extra = {}) => ({
  id: `e${seq++}`,
  date,
  amount,
  currency: 'INR',
  category: 'food',
  item: 'coffee',
  people: [],
  createdAt: seq,
  ...extra,
});

const SEP = { type: 'month', year: 2026, month: 8 };

describe('periods', () => {
  test('bounds', () => {
    assert.deepEqual(periodBounds(SEP), { start: '2026-09-01', end: '2026-09-30', days: 30 });
    assert.deepEqual(periodBounds({ type: 'month', year: 2024, month: 1 }).days, 29);
    assert.deepEqual(periodBounds({ type: 'year', year: 2026 }), { start: '2026-01-01', end: '2026-12-31', days: 365 });
  });

  test('shift across a year boundary', () => {
    assert.deepEqual(shiftPeriod({ type: 'month', year: 2026, month: 0 }, -1), { type: 'month', year: 2025, month: 11 });
    assert.deepEqual(shiftPeriod({ type: 'year', year: 2026 }, 1), { type: 'year', year: 2027 });
  });

  test('keys round-trip', () => {
    assert.equal(periodKey(SEP), '2026-09');
    assert.deepEqual(periodFromKey('2026-09'), SEP);
    assert.deepEqual(periodFromKey('2026'), { type: 'year', year: 2026 });
  });

  test('elapsed days', () => {
    assert.equal(elapsedDays(SEP, '2026-09-23'), 23);
    assert.equal(elapsedDays(SEP, '2026-10-05'), 30);
    assert.equal(elapsedDays(SEP, '2026-08-31'), 0);
  });

  test('a month in progress is compared with the same days of the month before', () => {
    const w = comparisonWindow(SEP, '2026-09-23');
    assert.deepEqual([w.start, w.end, w.partial], ['2026-08-01', '2026-08-23', true]);
    assert.equal(comparisonLabel(w), 'Aug 1–23');
  });

  test('a finished month is compared with the whole month before', () => {
    const w = comparisonWindow(SEP, '2026-10-02');
    assert.deepEqual([w.start, w.end, w.partial], ['2026-08-01', '2026-08-31', false]);
    assert.equal(comparisonLabel(w), 'August 2026');
  });

  test('comparison never runs past the end of a shorter previous month', () => {
    const march = { type: 'month', year: 2026, month: 2 };
    const w = comparisonWindow(march, '2026-03-31');
    assert.equal(w.end, '2026-02-28');
  });

  test('periods with data are listed newest first and include the current one', () => {
    const list = periodsWithData([exp('2026-07-02', 1), exp('2025-12-01', 1)], 'month', new Date(2026, 8, 23));
    assert.deepEqual(list.map(periodKey), ['2026-09', '2026-07', '2025-12']);
  });
});

describe('tracking start', () => {
  test('earliest date across currencies', () => {
    assert.equal(trackingStart([exp('2026-09-02', 1), exp('2026-07-15', 1, { currency: 'USD' })]), '2026-07-15');
    assert.equal(trackingStart([]), null);
  });

  test('a window is comparable only if tracking began by its first day', () => {
    assert.ok(wasTracked('2026-08-01', '2026-07-15'));
    assert.ok(wasTracked('2026-07-15', '2026-07-15'));
    assert.ok(!wasTracked('2026-07-01', '2026-07-15'));
    assert.ok(!wasTracked('2026-07-01', null));
  });
});

describe('currency (P0 #1)', () => {
  const mixed = [exp('2026-09-01', 500), exp('2026-09-02', 50, { currency: 'USD' }), exp('2026-09-03', 100)];

  test('totals are kept per currency, never summed together', () => {
    assert.deepEqual(sumByCurrency(mixed), { INR: 600, USD: 50 });
    assert.equal(formatTotals(sumByCurrency(mixed), 'INR'), '₹600 + $50');
  });

  test('summaries run on one currency', () => {
    assert.equal(summarize(inCurrency(mixed, 'INR')).total, 600);
  });

  test('pick the preferred currency when it has data, else the most used', () => {
    assert.equal(pickCurrency(mixed, 'INR'), 'INR');
    assert.equal(pickCurrency(mixed, 'EUR'), 'INR');
    assert.equal(pickCurrency([], 'EUR'), 'EUR');
    assert.deepEqual(currencyBreakdown(mixed).map((c) => c.currency), ['INR', 'USD']);
  });

  test('empty totals format as zero in the preferred currency', () => {
    assert.equal(formatTotals({}, 'INR'), '₹0');
  });
});

describe('summaries and series', () => {
  const sep = [
    exp('2026-09-01', 100, { category: 'food' }),
    exp('2026-09-01', 50, { category: 'transport', item: 'auto' }),
    exp('2026-09-03', 300, { category: 'food' }),
  ];

  test('summarize ranks categories by total', () => {
    const s = summarize(sep);
    assert.equal(s.total, 450);
    assert.equal(s.largest.amount, 300);
    assert.deepEqual(s.byCategory.map((c) => [c.category, c.total, c.count]), [['food', 400, 2], ['transport', 50, 1]]);
  });

  test('floating-point totals are rounded', () => {
    assert.equal(summarize([exp('2026-09-01', 0.1), exp('2026-09-01', 0.2)]).total, 0.3);
  });

  test('daily series marks future days as null', () => {
    const days = dailySeries(sep, SEP, '2026-09-03');
    assert.equal(days.length, 30);
    assert.deepEqual(days.slice(0, 4).map((d) => d.total), [150, 0, 300, null]);
  });

  test('monthly series', () => {
    const months = monthlySeries(sep, 2026, '2026-09-23');
    assert.equal(months[8].total, 450);
    assert.equal(months[0].total, 0);
    assert.equal(months[9].total, null);
  });

  test('rolling average and running total skip future points', () => {
    assert.deepEqual(rollingAverage([10, 20, 30, null], 2), [10, 15, 25, null]);
    assert.deepEqual(cumulative([10, 20, null]), [10, 30, null]);
  });

  test('period filter', () => {
    assert.equal(inPeriod([...sep, exp('2026-10-01', 5)], SEP).length, 3);
  });

  test('percent change has no baseline for zero', () => {
    assert.equal(percentChange(120, 100), 20);
    assert.equal(percentChange(5, 0), null);
  });
});

describe('items, people, recurring', () => {
  test('item keys ignore case, digits and articles', () => {
    assert.equal(itemKey({ item: '2 Coffee ' }), 'coffee');
    assert.equal(itemKey({ item: 'a T-shirt' }), 't shirt');
    assert.equal(itemKey({ item: '', category: 'bills' }), '(bills)');
  });

  test('top items group and rank', () => {
    const items = topItems([exp('2026-09-01', 100), exp('2026-09-02', 120, { item: 'Coffee' }), exp('2026-09-02', 150, { item: 'lunch' })]);
    assert.deepEqual(items.map((i) => [i.label, i.total, i.count]), [['Coffee', 220, 2], ['Lunch', 150, 1]]);
  });

  test('people stats report full bill values, not a split', () => {
    const people = peopleStats([
      exp('2026-09-01', 900, { people: ['Raj', 'Amit'] }),
      exp('2026-09-02', 300, { people: ['raj'] }),
    ]);
    assert.deepEqual(people.map((p) => [p.name, p.count, p.total]), [['Raj', 2, 1200], ['Amit', 1, 900]]);
  });

  test('a same-price monthly repeat is recurring; daily coffee is not', () => {
    const history = [
      exp('2026-07-05', 649, { item: 'music', category: 'entertainment' }),
      exp('2026-08-05', 649, { item: 'music', category: 'entertainment' }),
      exp('2026-07-01', 120), exp('2026-07-02', 120), exp('2026-07-03', 140),
      exp('2026-08-01', 120), exp('2026-08-02', 130),
    ];
    const keys = detectRecurringKeys(history);
    assert.ok(keys.has('music'));
    assert.ok(!keys.has('coffee'));
  });

  test('bills and known subscription words count as recurring on first sight', () => {
    const none = new Set();
    assert.ok(isRecurring(exp('2026-09-01', 15000, { item: 'rent', category: 'other' }), none));
    assert.ok(isRecurring(exp('2026-09-01', 1200, { item: 'power', category: 'bills' }), none));
    assert.ok(!isRecurring(exp('2026-09-01', 120), none));
  });

  test('projection counts recurring costs once', () => {
    const slice = [exp('2026-09-01', 15000, { item: 'rent', category: 'bills' }), exp('2026-09-02', 200), exp('2026-09-03', 100)];
    const split = recurringSplit(slice, new Set());
    assert.deepEqual([split.recurring, split.variable], [15000, 300]);
    // ₹300 of everyday spend over 3 days → ₹100/day × 30 + rent once
    assert.equal(projectTotal({ ...split, elapsed: 3, days: 30 }), 18000);
    assert.equal(projectTotal({ ...split, elapsed: 30, days: 30 }), null);
  });
});

describe('day stats', () => {
  test('no-spend days, busiest day and weekday split', () => {
    // 2026-09-05 and 06 are a Saturday and Sunday
    const slice = [exp('2026-09-01', 100), exp('2026-09-05', 400), exp('2026-09-06', 200)];
    const usd = exp('2026-09-02', 5, { currency: 'USD' });
    const stats = dayStats(slice, SEP, [...slice, usd], '2026-09-07');
    assert.equal(stats.elapsed, 7);
    assert.equal(stats.dailyAverage, 100);
    assert.deepEqual(stats.busiestDay, { date: '2026-09-05', total: 400 });
    // Sep 2 had USD spending, so only Sep 3, 4 and 7 had none at all
    assert.equal(stats.noSpendDays, 3);
    assert.equal(stats.weekendAverage, 300);
    assert.equal(stats.weekdayAverage, 20);
  });
});

describe('home helpers', () => {
  test('relative day names', () => {
    assert.equal(relativeDay('2026-09-23', '2026-09-23'), 'Today');
    assert.equal(relativeDay('2026-09-22', '2026-09-23'), 'Yesterday');
    assert.equal(relativeDay('2026-09-14', '2026-09-23'), 'Mon, Sep 14');
    assert.equal(relativeDay('2025-12-31', '2026-09-23'), 'Wed, Dec 31, 2025');
    assert.equal(relativeDay('2026-03-01', '2026-03-02'), 'Yesterday');
  });

  test('addDays crosses month and year boundaries', () => {
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  });

  test('greeting by hour', () => {
    assert.equal(greetingFor(8), 'Good morning');
    assert.equal(greetingFor(13), 'Good afternoon');
    assert.equal(greetingFor(20), 'Good evening');
    assert.equal(greetingFor(2), 'Good evening');
  });

  test('frequent items: repeats in the window, most common price, latest wording', () => {
    const list = [
      exp('2026-09-20', 120, { item: 'coffee', createdAt: 1 }),
      exp('2026-09-21', 140, { item: 'coffee', createdAt: 2 }),
      exp('2026-09-22', 120, { item: 'Coffee', createdAt: 3 }),
      exp('2026-09-18', 310, { item: 'lunch' }),
      exp('2026-09-19', 280, { item: 'lunch' }),
      exp('2026-09-10', 250, { item: 'uber', category: 'transport' }),
      exp('2026-09-12', 250, { item: 'uber', category: 'transport' }),
      exp('2026-09-15', 900, { item: 'shoes', category: 'shopping' }),
      exp('2026-05-01', 649, { item: 'netflix' }),
      exp('2026-06-01', 649, { item: 'netflix' }),
    ];
    const items = frequentItems(list, '2026-09-23');
    assert.deepEqual(
      items.map((i) => [i.label, i.amount, i.count]),
      // Equal counts: the more recently bought item comes first
      [['Coffee', 120, 3], ['lunch', null, 2], ['uber', 250, 2]],
    );
    assert.equal(items[2].category, 'transport');
  });

  test('frequent items keep their currency', () => {
    const list = [
      exp('2026-09-20', 5, { item: 'bagel', currency: 'USD' }),
      exp('2026-09-21', 5, { item: 'bagel', currency: 'USD' }),
    ];
    assert.equal(frequentItems(list, '2026-09-23')[0].currency, 'USD');
  });
});
