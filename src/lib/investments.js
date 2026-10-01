/**
 * @module investments
 * @description Pure calculations for the investments section: what each
 * holding is worth, what it returned, what needs attention, and how the
 * portfolio is spread. No storage, no React — everything here is testable
 * in Node.
 *
 * Model
 * - A holding is one thing you own (a fund, an FD, a stock basket on a
 *   platform). It carries its type and optional schedule details: interest
 *   rate, maturity, lock-in, SIP.
 * - Its history is a list of transactions:
 *     invest   — money put in (lump sum or a SIP installment)
 *     withdraw — money taken out (redemption, sale, maturity payout)
 *     income   — dividends or interest paid out to you
 *     value    — "it was worth X on this date" (a manual valuation)
 *
 * Amounts are never added across currencies; the portfolio is summarised
 * one currency at a time, the same rule the expense side follows.
 */

import { addDays, parseDateString, round2, spanDays, todayString } from './analytics.js';
import { toCsv } from './csv.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export const ASSET_CLASSES = Object.freeze({
  equity: 'Equity',
  debt: 'Debt',
  hybrid: 'Hybrid',
  gold: 'Gold',
  realEstate: 'Real estate',
  crypto: 'Crypto',
  cash: 'Cash',
  other: 'Other',
});

/**
 * `rate`: value grows from an interest rate (compounded `compounding` times
 * a year by default) instead of manual valuations.
 * `units`: usually bought in units with a market price (NAV, share price).
 * `lockInYears`: typical lock-in, offered as a default.
 */
export const INVESTMENT_TYPES = Object.freeze({
  stocks: { label: 'Stocks', emoji: '📈', assetClass: 'equity', units: true },
  equityMf: { label: 'Equity mutual fund', emoji: '📊', assetClass: 'equity', units: true },
  elss: { label: 'ELSS (tax saver)', emoji: '🧾', assetClass: 'equity', units: true, lockInYears: 3 },
  indexEtf: { label: 'Index fund / ETF', emoji: '🧺', assetClass: 'equity', units: true },
  debtMf: { label: 'Debt mutual fund', emoji: '📄', assetClass: 'debt', units: true },
  hybridMf: { label: 'Hybrid mutual fund', emoji: '⚖️', assetClass: 'hybrid', units: true },
  fd: { label: 'Fixed deposit', emoji: '🏦', assetClass: 'debt', rate: true, compounding: 4 },
  rd: { label: 'Recurring deposit', emoji: '🔁', assetClass: 'debt', rate: true, compounding: 4 },
  ppf: { label: 'PPF', emoji: '🛡️', assetClass: 'debt', rate: true, compounding: 1, lockInYears: 15 },
  epf: { label: 'EPF / VPF', emoji: '👷', assetClass: 'debt', rate: true, compounding: 1 },
  nps: { label: 'NPS', emoji: '🧓', assetClass: 'hybrid', units: true },
  bonds: { label: 'Bonds', emoji: '📜', assetClass: 'debt', rate: true, compounding: 1 },
  gold: { label: 'Gold (SGB, ETF, digital)', emoji: '🪙', assetClass: 'gold', units: true },
  realEstate: { label: 'Real estate', emoji: '🏠', assetClass: 'realEstate' },
  crypto: { label: 'Crypto', emoji: '🔗', assetClass: 'crypto', units: true },
  cash: { label: 'Savings / cash', emoji: '💵', assetClass: 'cash', rate: true, compounding: 4 },
  other: { label: 'Other', emoji: '📦', assetClass: 'other' },
});

export const COMPOUNDING = Object.freeze({ 1: 'Yearly', 2: 'Half-yearly', 4: 'Quarterly', 12: 'Monthly' });

export const TXN_KINDS = Object.freeze({
  invest: 'Invested',
  withdraw: 'Withdrawn',
  income: 'Dividend / interest',
  value: 'Value update',
});

/** Platforms offered as suggestions; anything typed is accepted. */
export const COMMON_PLATFORMS = [
  'Zerodha', 'Groww', 'Upstox', 'Kuvera', 'Coin', 'INDmoney', 'Paytm Money', 'Angel One',
  'ET Money', 'Dhan', 'Bank', 'Post office', 'EPFO', 'NSDL / CRA', 'Binance', 'CoinDCX',
];

export function typeInfo(type) {
  return INVESTMENT_TYPES[type] ?? INVESTMENT_TYPES.other;
}

/** Days after which a market-linked value is considered out of date. */
export const STALE_AFTER_DAYS = 30;

/** XIRR over a few weeks annualises noise into nonsense ("+400%"). */
export const MIN_DAYS_FOR_XIRR = 90;

// ─── Interest ─────────────────────────────────────────────────────────────────

/**
 * Compound growth of `amount` from one date to another.
 * @param {number} rate - Annual rate in percent (7.1 for 7.1%)
 * @param {number} perYear - Compounding periods per year
 */
export function grow(amount, rate, perYear, from, to) {
  if (!rate || to <= from) return amount;
  const years = (spanDays(from, to) - 1) / 365;
  const n = perYear || 1;
  return amount * (1 + rate / 100 / n) ** (n * years);
}

// ─── XIRR ─────────────────────────────────────────────────────────────────────

/**
 * Annualised return for irregular cash flows — the standard measure for SIPs,
 * where each installment has been invested for a different length of time.
 *
 * @param {Array<{ date: string, amount: number }>} flows
 *   Money you put in is negative; money out (and today's value) positive.
 * @returns {number|null} Percent per year, or null when it can't be solved
 */
export function xirr(flows) {
  const valid = flows.filter((f) => f.amount && f.date);
  if (valid.length < 2 || !valid.some((f) => f.amount < 0) || !valid.some((f) => f.amount > 0)) {
    return null;
  }
  const start = valid.reduce((min, f) => (f.date < min ? f.date : min), valid[0].date);
  const t = valid.map((f) => (spanDays(start, f.date) - 1) / 365);
  const npv = (r) => valid.reduce((sum, f, i) => sum + f.amount / (1 + r) ** t[i], 0);
  const slope = (r) => valid.reduce((sum, f, i) => sum - (t[i] * f.amount) / (1 + r) ** (t[i] + 1), 0);

  // Newton first: fast and exact for well-behaved flows.
  let r = 0.1;
  for (let i = 0; i < 100; i += 1) {
    const value = npv(r);
    const d = slope(r);
    if (!Number.isFinite(value) || !Number.isFinite(d) || d === 0) break;
    const next = r - value / d;
    if (next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-9) return round2(next * 100);
    r = next;
  }

  // Bisection fallback over a wide bracket.
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || Math.sign(fLo) === Math.sign(fHi)) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return round2(mid * 100);
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return round2(((lo + hi) / 2) * 100);
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

function byDate(a, b) {
  return a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * When the next SIP installment falls, and whether this month's is still
 * unpaid. It counts as paid once this month's investments add up to the
 * SIP amount (5% slack for rounding) — a small top-up doesn't settle it.
 *
 * @returns {{ date: string, status: 'due'|'upcoming', overdueDays: number } | null}
 */
export function sipStatus(holding, txns, today = todayString()) {
  if (!holding.sipAmount || !holding.sipDay || holding.closed) return null;

  const dueIn = (year, month) => {
    const day = Math.min(holding.sipDay, daysInMonth(year, month));
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  const now = parseDateString(today);
  const thisMonth = today.slice(0, 7);
  const dueThisMonth = dueIn(now.getFullYear(), now.getMonth());
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const dueNextMonth = dueIn(next.getFullYear(), next.getMonth());

  const investedThisMonth = txns
    .filter((t) => t.kind === 'invest' && t.date.startsWith(thisMonth))
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  const paid = investedThisMonth >= holding.sipAmount * 0.95;
  // A SIP set up after this month's date starts next month.
  const firstMoney = txns.filter((t) => t.kind === 'invest').map((t) => t.date).sort()[0];
  const startedAfterDue = firstMoney ? firstMoney > dueThisMonth : false;

  if (paid || startedAfterDue) return { date: dueNextMonth, status: 'upcoming', overdueDays: 0 };
  if (today >= dueThisMonth) {
    return { date: dueThisMonth, status: 'due', overdueDays: spanDays(dueThisMonth, today) - 1 };
  }
  return { date: dueThisMonth, status: 'upcoming', overdueDays: 0 };
}

/**
 * Everything worth knowing about one holding as of `today`.
 *
 * Value comes from, in order of preference:
 *  - interest: rate-based holdings grow every deposit at their rate (from the
 *    last manual valuation, if any), stopping at maturity
 *  - manual: the latest "value" entry, plus money moved in or out since
 *  - cost: no valuation yet — shown at what was put in, flagged as such
 *
 * Gain is total return: value now + everything taken out + income received
 * − everything put in. Return % is that over everything put in.
 */
export function summarizeHolding(holding, allTxns, today = todayString()) {
  const info = typeInfo(holding.type);
  const txns = allTxns.filter((t) => t.date <= today).sort(byDate);

  let totalIn = 0;
  let totalOut = 0;
  let income = 0;
  let units = 0;
  let cost = 0; // money still invested, at cost
  let unitsTracked = false;

  for (const t of txns) {
    const amount = t.amount || 0;
    if (t.kind === 'invest') {
      totalIn += amount;
      cost += amount;
      if (t.units) {
        units += t.units;
        unitsTracked = true;
      }
    } else if (t.kind === 'withdraw') {
      totalOut += amount;
      if (t.units && units > 0) {
        // Average-cost method: the sold units take their share of the cost.
        cost -= cost * Math.min(t.units / units, 1);
        units -= t.units;
      } else {
        cost -= Math.min(cost, amount);
      }
    } else if (t.kind === 'income') {
      income += amount;
    }
  }

  const valuations = txns.filter((t) => t.kind === 'value');
  const lastValuation = valuations[valuations.length - 1] ?? null;
  const flowsAfter = txns.filter(
    (t) => (t.kind === 'invest' || t.kind === 'withdraw') && (!lastValuation || byDate(t, lastValuation) > 0),
  );

  const rateBased = Boolean(info.rate && holding.rate > 0);
  const end = holding.maturityDate && holding.maturityDate < today ? holding.maturityDate : today;
  let value;
  let valueSource;
  let valueDate;
  let movedSinceValuation = 0;

  if (holding.closed) {
    value = 0;
    valueSource = 'closed';
    valueDate = txns[txns.length - 1]?.date ?? today;
  } else if (rateBased) {
    const perYear = holding.compounding || info.compounding || 1;
    const g = (amount, from) => grow(amount, holding.rate, perYear, from, end);
    value = lastValuation ? g(lastValuation.amount, lastValuation.date) : 0;
    for (const t of flowsAfter) value += t.kind === 'invest' ? g(t.amount, t.date) : -g(t.amount, t.date);
    valueSource = 'interest';
    valueDate = today;
  } else if (lastValuation) {
    value = lastValuation.amount;
    for (const t of flowsAfter) value += t.kind === 'invest' ? t.amount : -t.amount;
    movedSinceValuation = value - lastValuation.amount;
    valueSource = 'manual';
    valueDate = lastValuation.date;
  } else {
    value = cost;
    valueSource = 'cost';
    valueDate = null;
  }
  value = round2(Math.max(0, value));

  const gain = round2(value + totalOut + income - totalIn);
  const firstDate = txns.find((t) => t.kind === 'invest')?.date ?? null;
  const heldDays = firstDate ? spanDays(firstDate, today) - 1 : 0;

  const flows = [
    ...txns.filter((t) => t.kind === 'invest').map((t) => ({ date: t.date, amount: -t.amount })),
    ...txns.filter((t) => t.kind === 'withdraw' || t.kind === 'income').map((t) => ({ date: t.date, amount: t.amount })),
  ];
  if (value > 0) flows.push({ date: today, amount: value });

  const staleDays = valueSource === 'manual' ? spanDays(valueDate, today) - 1 : null;

  return {
    holding,
    info,
    assetClass: info.assetClass,
    currency: holding.currency || 'INR',
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
    income: round2(income),
    invested: round2(Math.max(0, cost)),
    value,
    valueSource,
    valueDate,
    // Net money added (+) or withdrawn (−) since the last manual valuation
    movedSinceValuation: round2(movedSinceValuation),
    gain,
    gainPct: totalIn > 0 ? round2((gain / totalIn) * 100) : null,
    xirr: heldDays >= MIN_DAYS_FOR_XIRR ? xirr(flows) : null,
    flows,
    units: unitsTracked ? round2(units * 1e4) / 1e4 : null,
    avgCost: unitsTracked && units > 0 ? round2(cost / units) : null,
    firstDate,
    heldDays,
    needsValue:
      !holding.closed && !rateBased && cost > 0 &&
      (valueSource === 'cost' || staleDays > STALE_AFTER_DAYS),
    staleDays,
    sip: sipStatus(holding, txns, today),
    matured: Boolean(holding.maturityDate && holding.maturityDate <= today && !holding.closed),
    locked: Boolean(holding.lockInUntil && holding.lockInUntil > today),
    txnCount: txns.length,
  };
}

/** "1y 4m", "7m", "12d" — how long money has been in. */
export function formatHeld(days) {
  if (days < 31) return `${days}d`;
  const months = Math.floor(days / 30.44);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m}m`;
  return m ? `${y}y ${m}m` : `${y}y`;
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

/**
 * Totals for one currency. Closed holdings contribute what they returned
 * (to gain and XIRR) but not to current value.
 */
export function summarizePortfolio(summaries, currency, today = todayString()) {
  const mine = summaries.filter((s) => s.currency === currency);
  const active = mine.filter((s) => !s.holding.closed);
  const sum = (list, key) => round2(list.reduce((total, s) => total + (s[key] || 0), 0));

  const totalIn = sum(mine, 'totalIn');
  const gain = sum(mine, 'gain');
  const monthPrefix = today.slice(0, 7);
  const investedThisMonth = round2(
    mine.reduce(
      (total, s) =>
        total + s.flows.filter((f) => f.amount < 0 && f.date.startsWith(monthPrefix)).reduce((t, f) => t - f.amount, 0),
      0,
    ),
  );
  const firstDate = mine.map((s) => s.firstDate).filter(Boolean).sort()[0];
  const heldDays = firstDate ? spanDays(firstDate, today) - 1 : 0;

  return {
    currency,
    count: active.length,
    value: sum(active, 'value'),
    invested: sum(active, 'invested'),
    totalIn,
    gain,
    gainPct: totalIn > 0 ? round2((gain / totalIn) * 100) : null,
    xirr: heldDays >= MIN_DAYS_FOR_XIRR ? xirr(mine.flatMap((s) => s.flows)) : null,
    investedThisMonth,
    monthlySip: round2(active.reduce((total, s) => total + (s.sip ? s.holding.sipAmount : 0), 0)),
    unvalued: active.filter((s) => s.valueSource === 'cost').length,
  };
}

/**
 * Current value grouped by a key — asset class, platform or goal — largest
 * first, with each group's share of the whole.
 */
export function allocation(summaries, keyOf, labelOf) {
  const groups = new Map();
  let total = 0;
  for (const s of summaries) {
    if (s.holding.closed || s.value <= 0) continue;
    const key = keyOf(s);
    const g = groups.get(key) || { key, label: labelOf(key), value: 0, count: 0 };
    g.value += s.value;
    g.count += 1;
    groups.set(key, g);
    total += s.value;
  }
  return [...groups.values()]
    .map((g) => ({ ...g, value: round2(g.value), share: total ? round2((g.value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);
}

// ─── Attention ────────────────────────────────────────────────────────────────

/**
 * Things to act on or know about, most urgent first: SIPs due, matured
 * deposits, valuations to refresh, and what's coming up in the next month.
 *
 * @returns {Array<{ kind: string, holdingId: string, date: string, urgent: boolean, summary: Object }>}
 */
export function attentionItems(summaries, today = todayString(), horizonDays = 30) {
  const horizon = addDays(today, horizonDays);
  const items = [];

  for (const s of summaries) {
    const h = s.holding;
    if (h.closed) continue;

    if (s.sip?.status === 'due') {
      items.push({ kind: 'sip-due', holdingId: h.id, date: s.sip.date, urgent: true, summary: s });
    } else if (s.sip && s.sip.date <= addDays(today, 7)) {
      items.push({ kind: 'sip-upcoming', holdingId: h.id, date: s.sip.date, urgent: false, summary: s });
    }

    if (s.matured) {
      items.push({ kind: 'matured', holdingId: h.id, date: h.maturityDate, urgent: true, summary: s });
    } else if (h.maturityDate && h.maturityDate <= horizon) {
      items.push({ kind: 'maturing', holdingId: h.id, date: h.maturityDate, urgent: false, summary: s });
    }

    if (h.lockInUntil && h.lockInUntil > today && h.lockInUntil <= horizon) {
      items.push({ kind: 'unlocking', holdingId: h.id, date: h.lockInUntil, urgent: false, summary: s });
    }

    if (s.needsValue) {
      items.push({ kind: 'update-value', holdingId: h.id, date: s.valueDate || today, urgent: false, summary: s });
    }
  }

  const rank = { 'sip-due': 0, matured: 1, 'sip-upcoming': 2, maturing: 3, unlocking: 4, 'update-value': 5 };
  return items.sort((a, b) => rank[a.kind] - rank[b.kind] || a.date.localeCompare(b.date));
}

// ─── Goals ────────────────────────────────────────────────────────────────────

/**
 * Progress towards a goal from the holdings linked to it, and the monthly
 * amount that would close the gap by the target date at the user's own
 * assumed return (0% if they gave none — no return is assumed for them).
 */
export function goalProgress(goal, summaries, today = todayString()) {
  const linked = summaries.filter((s) => s.holding.goalId === goal.id && !s.holding.closed);
  const current = round2(linked.reduce((total, s) => total + s.value, 0));
  const monthlySip = round2(linked.reduce((total, s) => total + (s.sip ? s.holding.sipAmount : 0), 0));
  const target = goal.target || 0;
  const remaining = round2(Math.max(0, target - current));

  let monthsLeft = null;
  let requiredMonthly = null;
  if (goal.targetDate && goal.targetDate > today && remaining > 0) {
    const from = parseDateString(today);
    const to = parseDateString(goal.targetDate);
    monthsLeft = Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
    const i = (1 + (goal.expectedReturn || 0) / 100) ** (1 / 12) - 1;
    const futureCurrent = current * (1 + i) ** monthsLeft;
    const gap = target - futureCurrent;
    requiredMonthly = gap <= 0 ? 0 : round2(i === 0 ? gap / monthsLeft : (gap * i) / ((1 + i) ** monthsLeft - 1));
  }

  return {
    goal,
    linked,
    current,
    target,
    remaining,
    pct: target > 0 ? Math.min(100, round2((current / target) * 100)) : null,
    reached: target > 0 && current >= target,
    monthsLeft,
    requiredMonthly,
    monthlySip,
    onTrack: requiredMonthly === null ? null : monthlySip >= requiredMonthly,
  };
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Words that mark a sentence as an investment rather than spending. Kept
 * specific: plain "gold" could be jewellery, "rd" could be a road.
 */
const INVESTMENT_PATTERN = new RegExp(
  `\\b(${[
    'invest(?:ed|ing|ment)?', 'sip', 'mutual funds?', 'mf', 'stocks?', 'shares', 'equity', 'etf',
    'index fund', 'nifty', 'sensex', 'zerodha', 'groww', 'upstox', 'kuvera', 'kite', 'paytm money',
    'indmoney', 'angel one', 'fd', 'fixed deposit', 'recurring deposit', 'ppf', 'epf', 'vpf', 'nps',
    'sgb', 'gold bonds?', 'digital gold', 'gold etf', 'crypto', 'bitcoin', 'btc', 'ethereum', 'bonds',
    'elss', 'demat',
  ].join('|')})\\b`,
  'i',
);

/** @returns {string|null} the word that gave it away, or null */
export function investmentKeyword(text) {
  const match = String(text || '').match(INVESTMENT_PATTERN);
  return match ? match[1] : null;
}

/**
 * The holding a sentence most likely refers to: the one whose name or
 * platform shares the most words with it. Null when nothing matches.
 */
export function guessHolding(text, holdings) {
  const words = new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  let best = null;
  let bestScore = 0;
  for (const h of holdings) {
    if (h.closed) continue;
    const own = `${h.name} ${h.platform || ''}`.toLowerCase().split(/[^a-z0-9]+/);
    const score = own.filter((w) => words.has(w)).length;
    if (score > bestScore) {
      best = h;
      bestScore = score;
    }
  }
  return best;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function holdingsToCsv(summaries, goalsById = new Map()) {
  const rows = [[
    'Name', 'Type', 'Asset class', 'Platform', 'Goal', 'Currency', 'Status', 'Put in', 'Taken out',
    'Income', 'Invested (at cost)', 'Current value', 'Value source', 'Value as of', 'Gain', 'Return %',
    'XIRR %', 'Units', 'Avg cost', 'Rate %', 'Maturity', 'Lock-in until', 'SIP amount', 'SIP day',
    'First investment', 'Notes',
  ]];
  for (const s of summaries) {
    const h = s.holding;
    rows.push([
      h.name, s.info.label, ASSET_CLASSES[s.assetClass], h.platform || '', goalsById.get(h.goalId)?.name || '',
      s.currency, h.closed ? 'Closed' : 'Active', s.totalIn, s.totalOut, s.income, s.invested, s.value,
      s.valueSource, s.valueDate || '', s.gain, s.gainPct ?? '', s.xirr ?? '', s.units ?? '', s.avgCost ?? '',
      h.rate ?? '', h.maturityDate || '', h.lockInUntil || '', h.sipAmount || '', h.sipDay || '',
      s.firstDate || '', h.notes || '',
    ]);
  }
  return toCsv(rows);
}

export function transactionsToCsv(txns, holdingsById) {
  const rows = [['Date', 'Holding', 'Type', 'Platform', 'Entry', 'Amount', 'Currency', 'Units', 'Note']];
  for (const t of [...txns].sort(byDate)) {
    const h = holdingsById.get(t.holdingId);
    rows.push([
      t.date, h?.name || '(deleted)', typeInfo(h?.type).label, h?.platform || '', TXN_KINDS[t.kind] || t.kind,
      t.amount, h?.currency || 'INR', t.units ?? '', t.note || '',
    ]);
  }
  return toCsv(rows);
}
