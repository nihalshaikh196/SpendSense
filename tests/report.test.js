import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { csvCell, expensesToCsv, toCsv } from '../src/lib/csv.js';
import { buildSummaryRows, SUMMARY_HEADERS } from '../src/lib/report.js';

const exp = (date, amount, extra = {}) => ({
  id: `${date}-${amount}`,
  date,
  amount,
  currency: 'INR',
  category: 'food',
  item: 'coffee',
  people: [],
  raw: '',
  createdAt: 1,
  ...extra,
});

describe('csv', () => {
  test('numbers stay bare, text is quoted', () => {
    assert.equal(csvCell(12.5), '12.5');
    assert.equal(csvCell('chai'), '"chai"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell(null), '""');
  });

  test('formula-looking text is neutralised', () => {
    assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvCell('+1'), `"'+1"`);
    assert.equal(csvCell('@SUM'), `"'@SUM"`);
  });

  test('rows use CRLF', () => {
    assert.equal(toCsv([['a', 1], ['b', 2]]), '"a",1\r\n"b",2');
  });

  test('expense export is oldest first with a header', () => {
    const lines = expensesToCsv([exp('2026-09-02', 20), exp('2026-09-01', 10, { people: ['A', 'B'] })]).split('\r\n');
    assert.equal(lines[0], '"Date","Item","Amount","Currency","Category","People","Raw Input"');
    assert.ok(lines[1].startsWith('"2026-09-01"'));
    assert.ok(lines[1].includes('"A, B"'));
  });
});

describe('summary report', () => {
  const data = [
    exp('2026-08-03', 100),
    exp('2026-09-01', 150),
    exp('2026-09-02', 50, { category: 'transport', item: 'auto', people: ['Raj'] }),
    exp('2026-09-02', 10, { currency: 'USD', item: 'snack' }),
  ];
  const month = { type: 'month', year: 2026, month: 8 };

  test('month report: per-currency totals, categories and days', () => {
    // A USD expense on Aug 1 marks tracking as started without touching INR totals
    const rows = buildSummaryRows([exp('2026-08-01', 1, { currency: 'USD', item: 'start' }), ...data], month, '2026-09-03');
    assert.deepEqual(rows[0], SUMMARY_HEADERS);

    const total = rows.filter((r) => r[0] === 'Total');
    assert.deepEqual(total.map((r) => [r[2], r[3], r[4]]), [['INR', 200, 2], ['USD', 10, 1]]);
    // In progress: compared with Aug 1–3, which had ₹100
    assert.equal(total[0][1], 'September 2026 vs Aug 1–3');
    assert.equal(total[0][6], 100);
    assert.equal(total[0][7], 100);

    const inrDays = rows.filter((r) => r[0] === 'Day' && r[2] === 'INR');
    assert.deepEqual(inrDays.map((r) => [r[1], r[3]]), [['2026-09-01', 150], ['2026-09-02', 50], ['2026-09-03', 0]]);

    const person = rows.find((r) => r[0] === 'Shared with');
    assert.deepEqual(person.slice(1, 5), ['Raj', 'INR', 50, 1]);
  });

  test('year report has one row per elapsed month', () => {
    const rows = buildSummaryRows(data, { type: 'year', year: 2026 }, '2026-09-03');
    const months = rows.filter((r) => r[0] === 'Month' && r[2] === 'INR');
    assert.equal(months.length, 9);
    assert.deepEqual(months.slice(7).map((r) => [r[1], r[3]]), [['August 2026', 100], ['September 2026', 200]]);
  });

  test('no comparison against a stretch before tracking began', () => {
    // Tracking began Aug 3, so Sep can't be compared with all of August…
    const rows = buildSummaryRows(data, month, '2026-10-05');
    const total = rows.find((r) => r[0] === 'Total' && r[2] === 'INR');
    assert.deepEqual([total[1], total[6], total[7]], ['September 2026', '', '']);
    // …and 2026 has no 2025 to compare with at all.
    const year = buildSummaryRows(data, { type: 'year', year: 2026 }, '2026-09-03');
    assert.ok(year.filter((r) => r[0] === 'Month').every((r) => r[6] === '' && r[7] === ''));
  });

  test('a period with no expenses yields just the header', () => {
    assert.equal(buildSummaryRows(data, { type: 'month', year: 2025, month: 0 }, '2026-09-03').length, 1);
  });
});
