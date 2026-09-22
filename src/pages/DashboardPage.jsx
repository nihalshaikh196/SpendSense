import { useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { CURRENCIES, formatAmount } from '../lib/currency.js';
import { getCategoryEmoji, getCategoryLabel } from '../lib/categories.js';
import {
  comparisonLabel,
  comparisonWindow,
  cumulative,
  currencyBreakdown,
  currentPeriod,
  dailySeries,
  dayStats,
  detectRecurringKeys,
  formatDay,
  inCurrency,
  inPeriod,
  inRange,
  isFuture,
  isInProgress,
  monthName,
  monthlySeries,
  parseDateString,
  peopleStats,
  percentChange,
  periodBounds,
  periodFromKey,
  periodKey,
  periodLabel,
  periodsWithData,
  pickCurrency,
  projectTotal,
  recurringSplit,
  rollingAverage,
  shiftPeriod,
  spanDays,
  summarize,
  todayString,
  topItems,
  trackingStart,
  wasTracked,
} from '../lib/analytics.js';
import { buildSummaryCsv } from '../lib/report.js';
import { downloadCsv, expensesToCsv } from '../lib/csv.js';
import StatTile, { Delta } from '../components/dashboard/StatTile.jsx';
import RankedList from '../components/dashboard/RankedList.jsx';
import BudgetCard from '../components/dashboard/BudgetCard.jsx';
import TrendCard from '../components/dashboard/TrendCard.jsx';
import './DashboardPage.css';

/** Projections from one or two days of data are noise, not a forecast. */
const MIN_DAYS_TO_PROJECT = { month: 3, year: 28 };

/** The `?period=` param if it's a valid "2026-09" or "2026", else this month. */
function periodKeyFromParam(value) {
  if (value && /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(value)) return value;
  return periodKey(currentPeriod('month'));
}

/** Link into the Expenses page with its filters pre-set (drill-down). */
function expensesLink({ q, category, currency, from, to }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (currency) params.set('currency', currency);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return `/expenses?${params}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Everything the dashboard shows for one period in one currency, computed
 * from the in-memory list in a single pass per section.
 */
function buildReport(expenses, period, currency, today) {
  const bounds = periodBounds(period);
  const inProgress = isInProgress(period, today);
  const allInPeriod = inPeriod(expenses, period);
  const slice = inCurrency(allInPeriod, currency);
  const summary = summarize(slice);

  // Only compare against a stretch that was actually tracked: a user who
  // started in July has no "January last year", not a January of zero.
  const trackedSince = trackingStart(expenses);
  const window = comparisonWindow(period, today);
  const compareName = comparisonLabel(window);
  const comparable = wasTracked(window.start, trackedSince);
  const previous = comparable
    ? summarize(inCurrency(inRange(expenses, window.start, window.end), currency))
    : null;
  const previousByCategory = new Map((previous?.byCategory ?? []).map((c) => [c.category, c.total]));

  const stats = dayStats(slice, period, allInPeriod, today);
  const recurringKeys = detectRecurringKeys(inCurrency(expenses, currency));
  const split = recurringSplit(slice, recurringKeys);

  // A month counts recurring costs once (rent isn't paid daily); across a
  // year they recur monthly, so a straight run-rate is the fairer estimate.
  // Rounded to whole units: paise on an estimate is false precision.
  let projected = null;
  if (inProgress && stats.elapsed >= MIN_DAYS_TO_PROJECT[period.type]) {
    const estimate = period.type === 'month'
      ? projectTotal({ ...split, elapsed: stats.elapsed, days: bounds.days })
      : projectTotal({ recurring: 0, variable: summary.total, elapsed: stats.elapsed, days: bounds.days });
    projected = estimate === null ? null : Math.round(estimate);
  }

  const prevPeriod = shiftPeriod(period, -1);
  const prevFull = inCurrency(inPeriod(expenses, prevPeriod), currency);
  let trend;
  let months = null;

  if (period.type === 'month') {
    const days = dailySeries(slice, period, today);
    const values = days.map((d) => d.total);
    const prevCumulative = cumulative(dailySeries(prevFull, prevPeriod, today).map((d) => d.total ?? 0));
    trend = {
      kind: 'month',
      points: days.map((d) => ({
        key: d.date,
        label: String(parseDateString(d.date).getDate()),
        title: formatDay(d.date),
        spent: d.total,
        to: expensesLink({ from: d.date, to: d.date, currency }),
      })),
      rolling: rollingAverage(values),
      previousValues: null,
      currentCumulative: cumulative(values),
      // Months differ in length: past the end of a shorter month, its total holds.
      previousCumulative: wasTracked(periodBounds(prevPeriod).start, trackedSince)
        ? values.map((_, i) => prevCumulative[Math.min(i, prevCumulative.length - 1)])
        : null,
      average: stats.dailyAverage,
      names: { current: periodLabel(period), previous: monthName(prevPeriod.month) },
    };
  } else {
    const series = monthlySeries(slice, period.year, today);
    const prevSeries = monthlySeries(prevFull, period.year - 1, today);
    // Months before tracking began are unknown, not zero.
    const prevValues = prevSeries.map((m) =>
      wasTracked(`${m.key}-01`, trackedSince) || m.total > 0 ? m.total ?? 0 : null,
    );
    const values = series.map((m) => m.total);
    const elapsedMonths = values.filter((v) => v !== null).length;
    trend = {
      kind: 'year',
      points: series.map((m) => ({
        key: m.key,
        label: monthName(m.month, 'short'),
        title: `${monthName(m.month)} ${period.year}`,
        spent: m.total,
        month: m.month,
      })),
      rolling: null,
      previousValues: prevValues.some((v) => v !== null) ? prevValues : null,
      currentCumulative: cumulative(values),
      previousCumulative: wasTracked(`${period.year - 1}-01-01`, trackedSince) ? cumulative(prevValues) : null,
      average: elapsedMonths ? summary.total / elapsedMonths : 0,
      names: { current: String(period.year), previous: String(period.year - 1) },
    };
    months = series
      .filter((m) => m.total !== null)
      .map((m) => {
        const monthPeriod = { type: 'month', year: period.year, month: m.month };
        return {
          ...m,
          period: monthPeriod,
          top: summarize(inPeriod(slice, monthPeriod)).byCategory[0] ?? null,
          previous: prevValues[m.month] ?? null,
        };
      })
      .reverse();
  }

  return {
    bounds,
    inProgress,
    allInPeriod,
    slice,
    summary,
    previous,
    previousByCategory,
    compareName,
    comparable,
    previousDaily: previous ? previous.total / spanDays(window.start, window.end) : null,
    stats,
    split,
    projected,
    trend,
    months,
    items: topItems(slice, 8),
    people: peopleStats(slice),
    otherCurrencies: currencyBreakdown(allInPeriod).filter((c) => c.currency !== currency),
  };
}

function DashboardPage() {
  const { expenses, loading } = useExpenses();
  const { currency: preferredCurrency, budgets, setBudget } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const exportMenuRef = useRef(null);

  const today = todayString();
  const key = periodKeyFromParam(searchParams.get('period'));
  const period = useMemo(() => periodFromKey(key), [key]);

  const currencies = useMemo(() => currencyBreakdown(expenses).map((c) => c.currency), [expenses]);
  const requestedCurrency = searchParams.get('currency');
  const currency = useMemo(() => {
    if (requestedCurrency && CURRENCIES[requestedCurrency]) return requestedCurrency;
    return pickCurrency(inPeriod(expenses, period), preferredCurrency);
  }, [requestedCurrency, expenses, period, preferredCurrency]);

  const report = useMemo(
    () => buildReport(expenses, period, currency, today),
    [expenses, period, currency, today],
  );

  // Every period with data, plus the one on screen even if it's empty.
  const periodOptions = useMemo(() => {
    const keys = new Set(periodsWithData(expenses, period.type).map(periodKey));
    keys.add(key);
    return [...keys].sort().reverse();
  }, [expenses, period, key]);

  const updateParams = (changes, { push = false } = {}) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: !push },
    );
  };

  const setPeriod = (p, options) => updateParams({ period: periodKey(p) }, options);

  const switchType = (type) => {
    if (type === period.type) return;
    if (type === 'year') {
      setPeriod({ type: 'year', year: period.year });
      return;
    }
    const now = currentPeriod('month');
    if (period.year === now.year) {
      setPeriod(now);
      return;
    }
    const latest = periodsWithData(expenses, 'month').find((p) => p.year === period.year);
    setPeriod(latest ?? { type: 'month', year: period.year, month: 11 });
  };

  const closeExportMenu = () => exportMenuRef.current?.removeAttribute('open');

  const exportExpenses = () => {
    downloadCsv(`spendsense_${key}_expenses.csv`, expensesToCsv(report.allInPeriod));
    closeExportMenu();
  };

  const exportSummary = () => {
    downloadCsv(`spendsense_${key}_summary.csv`, buildSummaryCsv(expenses, period, today));
    closeExportMenu();
  };

  if (loading) {
    return (
      <div className="dashboard-page page-container">
        <div className="empty-state">Loading dashboard…</div>
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="dashboard-page page-container">
        <h1 className="sr-only">Dashboard</h1>
        <div className="glass-card empty-state dash-empty">
          <div className="empty-state-icon">📊</div>
          <h2>Your reports start with one expense</h2>
          <p>
            Log what you spend in plain words — “chai 20”, “uber 250 to airport” — and this page
            fills in with monthly and yearly reports, trends, and where your money goes.
          </p>
          <Link to="/" className="btn-accent">Add your first expense</Link>
        </div>
      </div>
    );
  }

  const {
    bounds, inProgress, allInPeriod, summary, previous, previousByCategory, compareName, comparable,
    previousDaily, stats, split, projected, trend, months, items, people, otherCurrencies,
  } = report;

  const name = periodLabel(period);
  const unit = period.type === 'month' ? 'month' : 'year';
  const budget = budgets[currency];
  const hasData = summary.count > 0;
  const nextPeriod = shiftPeriod(period, 1);
  const latestWithData = periodsWithData(inCurrency(expenses, currency), period.type).find(
    (p) => inCurrency(inPeriod(expenses, p), currency).length > 0,
  );

  const rangeLink = (extra) => expensesLink({ from: bounds.start, to: bounds.end, currency, ...extra });
  const share = (amount) => (summary.total ? Math.round((amount / summary.total) * 100) : 0);
  const elapsedMonths = months?.length ?? 0;

  return (
    <div className="dashboard-page page-container" data-view={period.type}>
      <h1 className="sr-only">Dashboard — {name}</h1>

      {/* ─── Filters: scope everything below ─── */}
      <div className="dash-toolbar">
        <div className="segmented" role="group" aria-label="Report type">
          {['month', 'year'].map((type) => (
            <button key={type} type="button" aria-pressed={period.type === type} onClick={() => switchType(type)}>
              {type === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>

        <div className="period-nav">
          <button
            type="button"
            className="btn-icon-round"
            onClick={() => setPeriod(shiftPeriod(period, -1))}
            aria-label={`Previous ${unit}`}
          >
            ‹
          </button>
          <select
            aria-label={`Choose ${unit}`}
            value={key}
            onChange={(e) => setPeriod(periodFromKey(e.target.value))}
          >
            {periodOptions.map((k) => (
              <option key={k} value={k}>{periodLabel(periodFromKey(k))}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-icon-round"
            onClick={() => setPeriod(nextPeriod)}
            disabled={isFuture(nextPeriod, today)}
            aria-label={`Next ${unit}`}
          >
            ›
          </button>
        </div>

        {currencies.length > 1 && (
          <div className="segmented" role="group" aria-label="Currency">
            {currencies.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={code === currency}
                onClick={() => updateParams({ currency: code })}
              >
                {CURRENCIES[code]?.symbol ?? ''} {code}
              </button>
            ))}
          </div>
        )}

        <details className="export-menu" ref={exportMenuRef}>
          <summary className="btn-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </summary>
          <div className="export-menu-list">
            <button type="button" onClick={exportSummary} disabled={allInPeriod.length === 0}>
              <strong>Summary report</strong>
              <span>
                Totals by category, {period.type === 'month' ? 'day' : 'month'}, item and person
                {comparable ? `, with the change vs ${compareName}` : ''}
              </span>
            </button>
            <button type="button" onClick={exportExpenses} disabled={allInPeriod.length === 0}>
              <strong>All expenses</strong>
              <span>Every expense in {name}, one per row</span>
            </button>
          </div>
        </details>
      </div>

      {otherCurrencies.length > 0 && (
        <p className="currency-note">
          Also in {name}:{' '}
          {otherCurrencies.map((c, i) => (
            <span key={c.currency}>
              {i > 0 && ', '}
              <button type="button" className="btn-link" onClick={() => updateParams({ currency: c.currency })}>
                {formatAmount(c.total, c.currency)} ({plural(c.count, 'expense')})
              </button>
            </span>
          ))}
          . Totals are kept per currency, never added together.
        </p>
      )}

      {!hasData ? (
        <div className="glass-card empty-state dash-empty">
          <div className="empty-state-icon">🗓️</div>
          <h2>No {currency} expenses in {name}</h2>
          {inProgress ? (
            <>
              <p>Anything you log this {unit} will show up here.</p>
              <Link to="/" className="btn-accent">Add an expense</Link>
            </>
          ) : latestWithData ? (
            <button type="button" className="btn-secondary" onClick={() => setPeriod(latestWithData)}>
              Go to {periodLabel(latestWithData)}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* ─── Headline numbers ─── */}
          <section className="stat-grid" aria-label="Summary">
            <StatTile
              hero
              label={inProgress ? `Spent this ${unit}` : `Spent in ${name}`}
              value={formatAmount(summary.total, currency)}
              delta={comparable && <Delta pct={percentChange(summary.total, previous.total)} against={compareName} />}
              sub={plural(summary.count, 'expense')}
            />
            {period.type === 'month' ? (
              <StatTile
                label="Daily average"
                value={formatAmount(Math.round(stats.dailyAverage), currency)}
                delta={comparable && <Delta pct={percentChange(stats.dailyAverage, previousDaily)} against={compareName} />}
                sub={`over ${plural(stats.elapsed, 'day')}`}
              />
            ) : (
              <StatTile
                label="Monthly average"
                value={formatAmount(Math.round(trend.average), currency)}
                sub={`across ${plural(elapsedMonths, 'month')}`}
              />
            )}
            {summary.largest && (
              <StatTile
                label="Largest expense"
                value={formatAmount(summary.largest.amount, currency)}
                sub={`${summary.largest.item || getCategoryLabel(summary.largest.category)} · ${formatDay(summary.largest.date)}`}
              />
            )}
            {projected !== null && (
              <StatTile
                label="Projected"
                value={formatAmount(projected, currency)}
                sub={`by the end of ${period.type === 'month' ? monthName(period.month) : period.year}, at your current pace`}
              />
            )}
          </section>

          {/* ─── Trend ─── */}
          <TrendCard
            key={key}
            kind={trend.kind}
            points={trend.points}
            rolling={trend.rolling}
            previousValues={trend.previousValues}
            currentCumulative={trend.currentCumulative}
            previousCumulative={trend.previousCumulative}
            projected={projected}
            budget={budget}
            average={trend.average}
            names={trend.names}
            currency={currency}
            onSelect={(index) => {
              const point = trend.points[index];
              if (!point || point.spent === null) return;
              if (trend.kind === 'year') {
                setPeriod({ type: 'month', year: period.year, month: point.month }, { push: true });
              } else {
                navigate(point.to);
              }
            }}
          />

          {/* ─── Budget ─── */}
          {period.type === 'month' && (
            <section className="dash-card dash-budget" aria-labelledby="budget-title">
              <div className="card-header">
                <h2 id="budget-title">Budget</h2>
              </div>
              <BudgetCard
                key={currency}
                currency={currency}
                budget={budget}
                spent={summary.total}
                projected={projected}
                inProgress={inProgress}
                daysLeft={bounds.days - stats.elapsed}
                onSave={(amount) => setBudget(currency, amount)}
              />
            </section>
          )}

          {/* ─── Categories ─── */}
          <section className="dash-card dash-categories" aria-labelledby="categories-title">
            <div className="card-header">
              <h2 id="categories-title">Where it went</h2>
              {comparable && <span className="card-hint">vs {compareName}</span>}
            </div>
            <RankedList
              ariaLabel={`Spending by category in ${name}`}
              rows={summary.byCategory.map((cat) => {
                const prev = previousByCategory.get(cat.category) ?? 0;
                return {
                  key: cat.category,
                  label: (
                    <>
                      <span aria-hidden="true">{getCategoryEmoji(cat.category)}</span> {cat.label}
                    </>
                  ),
                  value: formatAmount(cat.total, currency),
                  amount: cat.total,
                  meta: (
                    <>
                      {share(cat.total)}% · {plural(cat.count, 'expense')}
                      {comparable && (
                        <>
                          {' · '}
                          <Delta compact pct={percentChange(cat.total, prev)} against={compareName} />
                        </>
                      )}
                    </>
                  ),
                  to: rangeLink({ category: cat.category }),
                };
              })}
            />
          </section>

          {/* ─── Patterns ─── */}
          <section className="dash-card dash-patterns" aria-labelledby="patterns-title">
            <div className="card-header">
              <h2 id="patterns-title">Patterns</h2>
            </div>
            <dl className="insight-list">
              {stats.busiestDay && (
                <div>
                  <dt>Most expensive day</dt>
                  <dd>
                    <Link to={expensesLink({ from: stats.busiestDay.date, to: stats.busiestDay.date, currency })}>
                      {formatDay(stats.busiestDay.date)}
                    </Link>
                    <span className="insight-value">{formatAmount(stats.busiestDay.total, currency)}</span>
                  </dd>
                </div>
              )}
              <div>
                <dt>No-spend days</dt>
                <dd>
                  <span>{stats.noSpendDays} of {plural(stats.elapsed, 'day')}</span>
                  <span className="insight-value">{stats.elapsed ? Math.round((stats.noSpendDays / stats.elapsed) * 100) : 0}%</span>
                </dd>
              </div>
              {stats.weekdayAverage !== null && stats.weekendAverage !== null && (
                <div>
                  <dt>Per day, weekdays vs weekends</dt>
                  <dd>
                    <span>
                      {formatAmount(Math.round(stats.weekdayAverage), currency)} vs{' '}
                      {formatAmount(Math.round(stats.weekendAverage), currency)}
                    </span>
                    <span className="insight-value">
                      {stats.weekdayAverage > 0 && stats.weekendAverage > 0
                        ? stats.weekendAverage >= stats.weekdayAverage
                          ? `Weekends ${Math.round(stats.weekendAverage / stats.weekdayAverage * 10) / 10}×`
                          : `Weekdays ${Math.round(stats.weekdayAverage / stats.weekendAverage * 10) / 10}×`
                        : '—'}
                    </span>
                  </dd>
                </div>
              )}
            </dl>

            <div className="split-block">
              <div className="split-head">
                <span>Recurring vs everyday</span>
              </div>
              <div className="split-bar" aria-hidden="true">
                {split.recurring > 0 && <span className="split-seg split-recurring" style={{ flexGrow: split.recurring }} />}
                {split.variable > 0 && <span className="split-seg split-variable" style={{ flexGrow: split.variable }} />}
              </div>
              <ul className="split-legend">
                <li>
                  <span className="legend-key legend-key-bar split-recurring" />
                  Recurring <strong>{formatAmount(split.recurring, currency)}</strong> ({share(split.recurring)}%)
                </li>
                <li>
                  <span className="legend-key legend-key-bar split-variable" />
                  Everyday <strong>{formatAmount(split.variable, currency)}</strong> ({share(split.variable)}%)
                </li>
              </ul>
              <p className="card-footnote">
                {split.recurringItems.length > 0
                  ? `Recurring here: ${split.recurringItems.slice(0, 4).map((i) => i.label).join(', ')}${split.recurringItems.length > 4 ? '…' : ''}. `
                  : ''}
                Recurring means bills, subscriptions, and anything repeating monthly at the same price.
              </p>
            </div>
          </section>

          {/* ─── Top items ─── */}
          <section className="dash-card dash-items" aria-labelledby="items-title">
            <div className="card-header">
              <h2 id="items-title">Top items</h2>
            </div>
            <RankedList
              ariaLabel={`Top items in ${name}`}
              rows={items.map((item) => ({
                key: item.key,
                label: item.label,
                value: formatAmount(item.total, currency),
                amount: item.total,
                meta: `${item.count}× · avg ${formatAmount(Math.round(item.total / item.count), currency)}`,
                to: item.key.startsWith('(')
                  ? rangeLink({ category: item.key.slice(1, -1) })
                  : rangeLink({ q: item.key }),
              }))}
            />
          </section>

          {/* ─── People ─── */}
          <section className="dash-card dash-people" aria-labelledby="people-title">
            <div className="card-header">
              <h2 id="people-title">Spent with</h2>
            </div>
            {people.length > 0 ? (
              <>
                <ul className="people-list">
                  {people.slice(0, 8).map((person) => (
                    <li key={person.name}>
                      <Link className="person-row" to={rangeLink({ q: person.name })}>
                        <span className="person-avatar" aria-hidden="true">{person.name.charAt(0).toUpperCase()}</span>
                        <span className="person-info">
                          <span className="person-name">{person.name}</span>
                          <span className="person-meta">{plural(person.count, 'expense')} together</span>
                        </span>
                        <span className="person-amount">{formatAmount(person.total, currency)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="card-footnote">
                  Full bill amounts. SpendSense doesn't record who paid or how a bill was split, so these aren't amounts owed.
                </p>
              </>
            ) : (
              <p className="card-note">
                No shared expenses in {name}. Mention people when you log — “dinner 1200 with Priya” — to see them here.
              </p>
            )}
          </section>

          {/* ─── Year report: one row per month ─── */}
          {months && (
            <section className="dash-card dash-months" aria-labelledby="months-title">
              <div className="card-header">
                <h2 id="months-title">Month by month</h2>
                {budget > 0 && (
                  <span className="card-hint">
                    Over budget in {months.filter((m) => m.total > budget).length} of {plural(months.length, 'month')}
                  </span>
                )}
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <caption className="sr-only">Monthly totals for {period.year}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col" className="num">Spent</th>
                      <th scope="col" className="num">Expenses</th>
                      <th scope="col">Top category</th>
                      <th scope="col" className="num">vs {period.year - 1}</th>
                      {budget > 0 && <th scope="col">Budget</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.key}>
                        <th scope="row">
                          <button type="button" className="btn-link" onClick={() => setPeriod(m.period, { push: true })}>
                            {monthName(m.month)}
                          </button>
                        </th>
                        <td className="num">{formatAmount(m.total, currency)}</td>
                        <td className="num">{m.count}</td>
                        <td>{m.top ? `${getCategoryEmoji(m.top.category)} ${m.top.label}` : '—'}</td>
                        <td className="num">
                          {m.previous === null ? (
                            <span className="delta delta-none">—</span>
                          ) : (
                            <Delta compact pct={percentChange(m.total, m.previous)} against={`${monthName(m.month, 'short')} ${period.year - 1}`} />
                          )}
                        </td>
                        {budget > 0 && (
                          <td>
                            {m.total > budget ? (
                              <span className="status status-critical"><span className="status-icon" aria-hidden="true">✕</span>Over</span>
                            ) : (
                              <span className="status status-good"><span className="status-icon" aria-hidden="true">✓</span>Under</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default DashboardPage;
