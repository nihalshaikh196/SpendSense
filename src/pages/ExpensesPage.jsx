import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useExpenseActions } from '../hooks/useExpenseActions.js';
import { CATEGORIES, getCategoryLabel } from '../lib/categories.js';
import { CURRENCIES, formatTotals } from '../lib/currency.js';
import {
  addDays,
  currencyBreakdown,
  currentPeriod,
  periodBounds,
  relativeDay,
  shiftPeriod,
  sumByCurrency,
  todayString,
} from '../lib/analytics.js';
import { downloadCsv, expensesToCsv } from '../lib/csv.js';
import ExpenseCard from '../components/ExpenseCard.jsx';
import EditExpenseModal from '../components/EditExpenseModal.jsx';
import './ExpensesPage.css';

const SORTS = {
  newest: { label: 'Newest first', compare: (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt },
  oldest: { label: 'Oldest first', compare: (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt },
  highest: { label: 'Highest amount', compare: (a, b) => b.amount - a.amount },
  lowest: { label: 'Lowest amount', compare: (a, b) => a.amount - b.amount },
};

/** Rendered in pages so a long history doesn't mount a thousand cards at once. */
const PAGE_SIZE = 60;

/** Letters and digits only, so "t shirt" finds "T-shirt". */
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function matchesSearch(expense, needle) {
  const haystack = [expense.item, expense.raw, getCategoryLabel(expense.category), ...(expense.people || [])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle) || normalize(haystack).includes(normalize(needle));
}

/** One-tap date ranges. "This month" matches the Dashboard's drill-down links. */
function datePresets(today) {
  const month = currentPeriod('month');
  const range = (period) => {
    const { start, end } = periodBounds(period);
    return { from: start, to: end };
  };
  return [
    { id: 'all', label: 'All time', from: '', to: '' },
    { id: 'month', label: 'This month', ...range(month) },
    { id: 'last-month', label: 'Last month', ...range(shiftPeriod(month, -1)) },
    { id: 'last-30', label: 'Last 30 days', from: addDays(today, -29), to: today },
    { id: 'year', label: 'This year', ...range(currentPeriod('year')) },
  ];
}

/** Consecutive expenses on the same date, for day headers. */
function groupByDay(list) {
  const groups = [];
  for (const expense of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === expense.date) last.items.push(expense);
    else groups.push({ date: expense.date, items: [expense] });
  }
  return groups;
}

function ExpensesPage() {
  const { expenses, loading } = useExpenses();
  const { currency: preferredCurrency } = useSettings();
  const { deleteWithUndo, saveWithUndo, moveToInvestments } = useExpenseActions();
  const [searchParams, setSearchParams] = useSearchParams();
  const ids = useId();
  const today = todayString();

  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const currency = searchParams.get('currency') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const sort = SORTS[searchParams.get('sort')] ? searchParams.get('sort') : 'newest';

  const presets = useMemo(() => datePresets(today), [today]);
  const activePreset = presets.find((p) => p.from === from && p.to === to);
  const customDates = !activePreset;

  // What the Filters button hides; chips already show their own state.
  const panelFilters = [Boolean(currency), customDates, sort !== 'newest'].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(panelFilters > 0);
  const [editing, setEditing] = useState(null);

  const currencies = useMemo(() => currencyBreakdown(expenses).map((c) => c.currency), [expenses]);

  // Only categories that have been used, most used first.
  const categoryChips = useMemo(() => {
    const counts = new Map();
    for (const e of expenses) counts.set(e.category, (counts.get(e.category) || 0) + 1);
    return Object.values(CATEGORIES)
      .filter((c) => counts.has(c.key))
      .sort((a, b) => counts.get(b.key) - counts.get(a.key));
  }, [expenses]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return expenses
      .filter((e) => {
        if (category && e.category !== category) return false;
        if (currency && (e.currency || 'INR') !== currency) return false;
        if (from && e.date < from) return false;
        if (to && e.date > to) return false;
        if (needle && !matchesSearch(e, needle)) return false;
        return true;
      })
      .sort(SORTS[sort].compare);
  }, [expenses, q, category, currency, from, to, sort]);

  // Paging resets whenever the filters change.
  const filterKey = searchParams.toString();
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE_SIZE });
  const limit = paging.key === filterKey ? paging.limit : PAGE_SIZE;

  const byDate = sort === 'newest' || sort === 'oldest';
  let visible = filtered.slice(0, limit);
  // Never cut a day in half: its header total must match the cards under it.
  if (byDate && visible.length && visible.length < filtered.length) {
    const lastDate = visible[visible.length - 1].date;
    let end = visible.length;
    while (end < filtered.length && filtered[end].date === lastDate) end += 1;
    visible = filtered.slice(0, end);
  }
  const remaining = filtered.length - visible.length;

  const setParams = (changes) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [name, value] of Object.entries(changes)) {
          if (value) next.set(name, value);
          else next.delete(name);
        }
        return next;
      },
      { replace: true },
    );
  };

  const clearAll = () => setSearchParams({}, { replace: true });
  const isFiltered = Boolean(q) || Boolean(category) || panelFilters > 0 || activePreset?.id !== 'all';

  const exportFiltered = () => {
    downloadCsv(`spendsense_expenses_${today}.csv`, expensesToCsv(filtered));
  };

  const renderCard = (expense, index, showDate) => (
    <ExpenseCard
      key={expense.id}
      expense={expense}
      today={today}
      showDate={showDate}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      onOpen={setEditing}
      onDelete={deleteWithUndo}
    />
  );

  return (
    <div className="expenses-page page-container">
      <section className="recent-section">
        <div className="section-header">
          <h1 className="page-title">All expenses</h1>
          {!loading && expenses.length > 0 && <span className="expenses-count">{expenses.length}</span>}
        </div>

        {!loading && expenses.length > 0 && (
          <div className="expenses-controls">
            <div className="expenses-toolbar">
              <div className="search-field">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  placeholder="Search items, people, notes…"
                  aria-label="Search expenses"
                  value={q}
                  onChange={(e) => setParams({ q: e.target.value })}
                />
              </div>
              <button
                type="button"
                className={`btn-secondary filter-toggle ${panelFilters ? 'has-filters' : ''}`}
                aria-expanded={filtersOpen}
                aria-controls={`${ids}-filters`}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="7" y1="12" x2="17" y2="12" />
                  <line x1="10" y1="18" x2="14" y2="18" />
                </svg>
                <span className="filter-toggle-label">Filters</span>
                {panelFilters > 0 && <span className="filter-count">{panelFilters}</span>}
              </button>
            </div>

            <div className="chip-row" role="group" aria-label="Date range">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="filter-chip"
                  aria-pressed={activePreset?.id === preset.id}
                  onClick={() => setParams({ from: preset.from, to: preset.to })}
                >
                  {preset.label}
                </button>
              ))}
              {customDates && (
                <button type="button" className="filter-chip" aria-pressed="true" onClick={() => setFiltersOpen(true)}>
                  {from ? relativeDay(from, today) : '…'} – {to ? relativeDay(to, today) : '…'}
                </button>
              )}
            </div>

            {categoryChips.length > 1 && (
              <div className="chip-row" role="group" aria-label="Category">
                <button
                  type="button"
                  className="filter-chip"
                  aria-pressed={!category}
                  onClick={() => setParams({ category: '' })}
                >
                  All
                </button>
                {categoryChips.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    className="filter-chip"
                    aria-pressed={category === cat.key}
                    onClick={() => setParams({ category: category === cat.key ? '' : cat.key })}
                  >
                    <span aria-hidden="true">{cat.emoji}</span> {cat.label}
                  </button>
                ))}
              </div>
            )}

            {filtersOpen && (
              <div id={`${ids}-filters`} className="glass-card filter-panel">
                <div className="form-group">
                  <label htmlFor={`${ids}-from`}>From</label>
                  <input id={`${ids}-from`} type="date" value={from} max={to || undefined} onChange={(e) => setParams({ from: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor={`${ids}-to`}>To</label>
                  <input id={`${ids}-to`} type="date" value={to} min={from || undefined} onChange={(e) => setParams({ to: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor={`${ids}-sort`}>Sort</label>
                  <select id={`${ids}-sort`} value={sort} onChange={(e) => setParams({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
                    {Object.entries(SORTS).map(([value, { label }]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                {currencies.length > 1 && (
                  <div className="form-group">
                    <label htmlFor={`${ids}-currency`}>Currency</label>
                    <select id={`${ids}-currency`} value={currency} onChange={(e) => setParams({ currency: e.target.value })}>
                      <option value="">All currencies</option>
                      {currencies.map((code) => (
                        <option key={code} value={code}>{CURRENCIES[code]?.symbol} {code}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <p className="filter-summary" role="status">
              <span>
                {isFiltered ? `${filtered.length} of ${expenses.length}` : `${expenses.length} expenses`}
                {filtered.length > 0 && <> · <strong>{formatTotals(sumByCurrency(filtered), preferredCurrency)}</strong></>}
              </span>
              <span className="filter-summary-actions">
                {filtered.length > 0 && (
                  <button type="button" className="btn-link" onClick={exportFiltered}>Export CSV</button>
                )}
                {isFiltered && (
                  <button type="button" className="btn-link" onClick={clearAll}>Clear filters</button>
                )}
              </span>
            </p>
          </div>
        )}

        {loading ? (
          <div className="expense-list">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="glass-card skeleton-card">
                <div className="skeleton skeleton-icon"></div>
                <div className="skeleton-text">
                  <div className="skeleton skeleton-line-1"></div>
                  <div className="skeleton skeleton-line-2"></div>
                </div>
                <div className="skeleton skeleton-amount"></div>
              </div>
            ))}
          </div>
        ) : expenses.length === 0 ? (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">📝</div>
            <p className="empty-state-text">Nothing here yet. Everything you log shows up in this list.</p>
            <Link to="/" className="btn-accent">Add an expense</Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <p className="empty-state-text">
              {q ? `Nothing matches “${q}”` : 'No expenses match these filters'}
              {category ? ` in ${getCategoryLabel(category)}` : ''}.
            </p>
            <button type="button" className="btn-secondary" onClick={clearAll}>Clear filters</button>
          </div>
        ) : byDate ? (
          <div className="day-groups">
            {groupByDay(visible).map((group, g) => (
              <section key={group.date} className="day-group" aria-labelledby={`${ids}-day-${g}`}>
                <h2 id={`${ids}-day-${g}`} className="day-header">
                  <span>{relativeDay(group.date, today)}</span>
                  <span className="day-total">
                    {formatTotals(sumByCurrency(group.items), preferredCurrency)}
                  </span>
                </h2>
                <div className="expense-list">
                  {group.items.map((expense, i) => renderCard(expense, g + i, false))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="expense-list">
            {visible.map((expense, i) => renderCard(expense, i, true))}
          </div>
        )}

        {remaining > 0 && (
          <button
            type="button"
            className="btn-secondary show-more"
            onClick={() => setPaging({ key: filterKey, limit: limit + PAGE_SIZE })}
          >
            Show more · {remaining} left
          </button>
        )}
      </section>

      {editing && (
        <EditExpenseModal
          expense={editing}
          onSave={(updates) => saveWithUndo(editing, updates)}
          onDelete={deleteWithUndo}
          onMoveToInvestments={moveToInvestments}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default ExpensesPage;
