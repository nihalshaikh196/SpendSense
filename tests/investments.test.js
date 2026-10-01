import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  allocation,
  attentionItems,
  formatHeld,
  goalProgress,
  grow,
  guessHolding,
  holdingsToCsv,
  investmentKeyword,
  sipStatus,
  summarizeHolding,
  summarizePortfolio,
  xirr,
} from '../src/lib/investments.js';

let seq = 0;
const tx = (kind, date, amount, extra = {}) => ({ id: `t${seq++}`, kind, date, amount, createdAt: seq, ...extra });
const holding = (extra = {}) => ({ id: `h${seq++}`, name: 'Flexi cap fund', type: 'equityMf', currency: 'INR', ...extra });

describe('interest and XIRR', () => {
  test('compound growth', () => {
    assert.equal(Math.round(grow(100000, 7, 1, '2025-01-01', '2026-01-01')), 107000);
    assert.equal(Math.round(grow(100000, 7, 4, '2025-01-01', '2026-01-01')), 107186);
    assert.equal(grow(100000, 0, 4, '2025-01-01', '2026-01-01'), 100000);
  });

  test('a single year at 10%', () => {
    assert.equal(xirr([{ date: '2025-01-01', amount: -10000 }, { date: '2026-01-01', amount: 11000 }]), 10);
  });

  test('irregular flows solve to zero NPV', () => {
    const flows = [
      { date: '2024-01-10', amount: -5000 },
      { date: '2024-06-10', amount: -5000 },
      { date: '2025-02-10', amount: -5000 },
      { date: '2026-01-10', amount: 17800 },
    ];
    const r = xirr(flows) / 100;
    const start = new Date(2024, 0, 10);
    const npv = flows.reduce((sum, f) => {
      const [y, m, d] = f.date.split('-').map(Number);
      const years = (new Date(y, m - 1, d) - start) / 864e5 / 365;
      return sum + f.amount / (1 + r) ** years;
    }, 0);
    assert.ok(Math.abs(npv) < 1, `NPV ${npv}`);
  });

  test('losses come out negative', () => {
    assert.equal(xirr([{ date: '2025-01-01', amount: -10000 }, { date: '2026-01-01', amount: 8000 }]), -20);
  });

  test('no answer without money both ways', () => {
    assert.equal(xirr([{ date: '2025-01-01', amount: -10000 }]), null);
    assert.equal(xirr([{ date: '2025-01-01', amount: -1 }, { date: '2025-02-01', amount: -1 }]), null);
  });
});

describe('holding summary', () => {
  test('manual valuation: value, gain and return', () => {
    const s = summarizeHolding(holding(), [
      tx('invest', '2025-01-01', 10000),
      tx('invest', '2025-07-01', 10000),
      tx('value', '2026-01-01', 23000),
    ], '2026-01-10');
    assert.deepEqual([s.value, s.totalIn, s.gain, s.gainPct, s.valueSource], [23000, 20000, 3000, 15, 'manual']);
    assert.equal(s.valueDate, '2026-01-01');
    assert.ok(s.xirr > 15 && s.xirr < 25, `xirr ${s.xirr}`);
  });

  test('money moved after a valuation is added on top of it', () => {
    const s = summarizeHolding(holding(), [
      tx('invest', '2025-01-01', 10000),
      tx('value', '2025-12-01', 12000),
      tx('invest', '2025-12-15', 5000),
      tx('withdraw', '2025-12-20', 1000),
    ], '2025-12-25');
    assert.equal(s.value, 16000);
  });

  test('no valuation yet: shown at cost and flagged', () => {
    const s = summarizeHolding(holding(), [tx('invest', '2026-09-01', 5000)], '2026-10-02');
    assert.deepEqual([s.value, s.valueSource, s.needsValue, s.gain], [5000, 'cost', true, 0]);
  });

  test('a valuation older than a month is stale', () => {
    const s = summarizeHolding(holding(), [tx('invest', '2026-01-01', 5000), tx('value', '2026-08-01', 5600)], '2026-10-02');
    assert.ok(s.needsValue);
    assert.equal(s.staleDays, 62);
  });

  test('units: average cost survives a partial sale', () => {
    const s = summarizeHolding(holding(), [
      tx('invest', '2025-01-01', 10000, { units: 100 }),
      tx('invest', '2025-02-01', 12000, { units: 100 }),
      tx('withdraw', '2025-03-01', 7000, { units: 50 }),
    ], '2025-03-02');
    assert.deepEqual([s.units, s.invested, s.avgCost], [150, 16500, 110]);
  });

  test('FD grows at its rate and stops at maturity', () => {
    const fd = holding({ type: 'fd', rate: 7, compounding: 4, maturityDate: '2026-01-01' });
    const running = summarizeHolding(fd, [tx('invest', '2025-01-01', 100000)], '2025-07-02');
    assert.equal(running.valueSource, 'interest');
    assert.ok(running.value > 103000 && running.value < 104000, `${running.value}`);
    assert.ok(!running.needsValue);

    const after = summarizeHolding(fd, [tx('invest', '2025-01-01', 100000)], '2026-06-01');
    assert.equal(Math.round(after.value), 107186);
    assert.ok(after.matured);
  });

  test('closed holdings keep their realised gain but no value', () => {
    const s = summarizeHolding(holding({ closed: true }), [
      tx('invest', '2025-01-01', 10000),
      tx('income', '2025-06-01', 200),
      tx('withdraw', '2026-01-01', 11000),
    ], '2026-02-01');
    assert.deepEqual([s.value, s.gain, s.gainPct], [0, 1200, 12]);
  });

  test('future-dated entries are ignored until their day', () => {
    const s = summarizeHolding(holding(), [tx('invest', '2026-09-01', 1000), tx('invest', '2026-12-01', 1000)], '2026-10-02');
    assert.equal(s.totalIn, 1000);
  });

  test('held duration', () => {
    assert.equal(formatHeld(12), '12d');
    assert.equal(formatHeld(200), '6m');
    assert.equal(formatHeld(500), '1y 4m');
    assert.equal(formatHeld(731), '2y');
  });
});

describe('SIP schedule', () => {
  const sip = holding({ sipAmount: 5000, sipDay: 5 });
  const history = [tx('invest', '2026-08-05', 5000), tx('invest', '2026-09-05', 5000)];

  test('upcoming before the day', () => {
    assert.deepEqual(sipStatus(sip, history, '2026-10-02'), { date: '2026-10-05', status: 'upcoming', overdueDays: 0 });
  });

  test('due once the day passes unpaid', () => {
    assert.deepEqual(sipStatus(sip, history, '2026-10-07'), { date: '2026-10-05', status: 'due', overdueDays: 2 });
  });

  test('a small top-up does not count as the SIP', () => {
    const topUp = [...history, tx('invest', '2026-10-01', 180)];
    assert.equal(sipStatus(sip, topUp, '2026-10-07').status, 'due');
    const both = [...topUp, tx('invest', '2026-10-06', 4900)];
    assert.equal(sipStatus(sip, both, '2026-10-07').date, '2026-11-05');
  });

  test('paid this month moves to next month', () => {
    const paid = [...history, tx('invest', '2026-10-06', 5000)];
    assert.equal(sipStatus(sip, paid, '2026-10-07').date, '2026-11-05');
  });

  test('a SIP started after this month\'s day begins next month', () => {
    assert.equal(sipStatus(sip, [tx('invest', '2026-09-20', 5000)], '2026-09-25').date, '2026-10-05');
  });

  test('day 31 falls on the last day of short months', () => {
    const late = holding({ sipAmount: 1000, sipDay: 31 });
    assert.equal(sipStatus(late, [tx('invest', '2026-01-31', 1000)], '2026-02-10').date, '2026-02-28');
  });

  test('no SIP, no status', () => {
    assert.equal(sipStatus(holding(), history, '2026-10-02'), null);
  });
});

describe('portfolio', () => {
  const today = '2026-10-02';
  const mf = summarizeHolding(holding({ platform: 'Zerodha' }), [tx('invest', '2025-01-01', 10000), tx('value', '2026-10-01', 13000)], today);
  const fd = summarizeHolding(holding({ type: 'fd', rate: 7, platform: 'Bank' }), [tx('invest', '2026-10-01', 50000)], today);
  const usd = summarizeHolding(holding({ type: 'stocks', currency: 'USD' }), [tx('invest', '2025-01-01', 100)], today);

  test('totals stay per currency', () => {
    const inr = summarizePortfolio([mf, fd, usd], 'INR', today);
    assert.equal(inr.count, 2);
    assert.equal(Math.round(inr.value), 63010);
    assert.equal(inr.totalIn, 60000);
    assert.equal(inr.investedThisMonth, 50000);
    assert.equal(summarizePortfolio([mf, fd, usd], 'USD', today).value, 100);
  });

  test('allocation by asset class', () => {
    const rows = allocation([mf, fd], (s) => s.assetClass, (k) => k);
    assert.deepEqual(rows.map((r) => r.key), ['debt', 'equity']);
    assert.equal(Math.round(rows[0].share + rows[1].share), 100);
  });

  test('attention: due SIP first, then maturity, then stale values', () => {
    const items = attentionItems([
      summarizeHolding(holding(), [tx('invest', '2026-01-01', 5000)], today),
      summarizeHolding(holding({ type: 'fd', rate: 7, maturityDate: '2026-10-20' }), [tx('invest', '2026-01-01', 10000)], today),
      summarizeHolding(holding({ sipAmount: 1000, sipDay: 1 }), [tx('invest', '2026-09-01', 1000), tx('value', '2026-09-30', 1000)], today),
    ], today);
    assert.deepEqual(items.map((i) => i.kind), ['sip-due', 'maturing', 'update-value']);
  });
});

describe('goals', () => {
  const goal = { id: 'g1', name: 'House', target: 100000, targetDate: '2027-10-02' };
  const linked = summarizeHolding(holding({ goalId: 'g1', sipAmount: 4000, sipDay: 5 }), [tx('invest', '2026-01-01', 40000), tx('value', '2026-10-01', 40000)], '2026-10-02');

  test('progress and the monthly amount needed with no assumed return', () => {
    const p = goalProgress(goal, [linked], '2026-10-02');
    assert.deepEqual([p.current, p.pct, p.monthsLeft, p.requiredMonthly], [40000, 40, 12, 5000]);
    assert.equal(p.monthlySip, 4000);
    assert.equal(p.onTrack, false);
  });

  test('an assumed return lowers what is needed', () => {
    const p = goalProgress({ ...goal, expectedReturn: 12 }, [linked], '2026-10-02');
    assert.ok(p.requiredMonthly < 5000 && p.requiredMonthly > 4000, `${p.requiredMonthly}`);
  });

  test('reached goals need nothing more', () => {
    const p = goalProgress({ ...goal, target: 30000 }, [linked], '2026-10-02');
    assert.ok(p.reached);
    assert.equal(p.requiredMonthly, null);
  });
});

describe('detection', () => {
  test('investment wording', () => {
    assert.equal(investmentKeyword('added 180 in zerodha yesterday'), 'zerodha');
    assert.equal(investmentKeyword('SIP 5000 parag parikh'), 'SIP');
    assert.equal(investmentKeyword('bought 2 shares of infosys'), 'shares');
    assert.equal(investmentKeyword('fd 50000 at sbi'), 'fd');
  });

  test('ordinary spending is left alone', () => {
    assert.equal(investmentKeyword('gold earrings 5000'), null);
    assert.equal(investmentKeyword('3rd floor rent 15000'), null);
    assert.equal(investmentKeyword('coffee 120'), null);
  });

  test('guess the holding from shared words', () => {
    const list = [
      holding({ id: 'a', name: 'Nifty 50 index', platform: 'Zerodha' }),
      holding({ id: 'b', name: 'HDFC FD', platform: 'Bank' }),
    ];
    assert.equal(guessHolding('added 180 in zerodha', list).id, 'a');
    assert.equal(guessHolding('renewed hdfc fd', list).id, 'b');
    assert.equal(guessHolding('something else', list), null);
  });
});

test('holdings export has one row per holding', () => {
  const csv = holdingsToCsv([summarizeHolding(holding(), [tx('invest', '2026-01-01', 5000)], '2026-10-02')]);
  assert.equal(csv.split('\r\n').length, 2);
  assert.ok(csv.includes('"Equity mutual fund"'));
});
