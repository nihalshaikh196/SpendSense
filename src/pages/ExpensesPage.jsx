import { useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { CATEGORIES, getCategoryLabel } from '../lib/categories.js';
import { CURRENCIES, formatAmount, formatTotals } from '../lib/currency.js';
import { currencyBreakdown, formatDay, sumByCurrency } from '../lib/analytics.js';
import { logError } from '../lib/log.js';
import ExpenseCard from '../components/ExpenseCard.jsx';
import Modal from '../components/Modal.jsx';
import './HomePage.css';
import './ExpensesPage.css';

const SORTS = {
  newest: { label: 'Newest first', compare: (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt },
  oldest: { label: 'Oldest first', compare: (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt },
  highest: { label: 'Highest amount', compare: (a, b) => b.amount - a.amount },
  lowest: { label: 'Lowest amount', compare: (a, b) => a.amount - b.amount },
};

const FILTER_PARAMS = ['category', 'currency', 'from', 'to', 'sort'];

/** Letters and digits only, so "t shirt" finds "T-shirt". */
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function matchesSearch(expense, needle) {
  const haystack = [expense.item, expense.raw, getCategoryLabel(expense.category), ...(expense.people || [])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle) || normalize(haystack).includes(normalize(needle));
}

function EditExpenseModal({ expense, onSave, onClose }) {
  const ids = useId();
  const amountRef = useRef(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: String(expense.amount),
    item: expense.item,
    date: expense.date,
    category: expense.category,
    people: (expense.people || []).join(', '),
  });

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Choose a date.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        amount: Math.round(amount * 100) / 100,
        item: form.item.trim(),
        date: form.date,
        category: form.category,
        people: form.people.split(',').map((p) => p.trim()).filter(Boolean),
      });
      onClose();
    } catch (err) {
      logError('Failed to save edit', err);
      setError('Couldn’t save the change. Try again.');
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit expense" onClose={onClose} initialFocusRef={amountRef}>
      <form className="edit-form" onSubmit={save} noValidate>
        <div className="form-group">
          <label htmlFor={`${ids}-amount`}>Amount ({expense.currency})</label>
          <input
            id={`${ids}-amount`}
            ref={amountRef}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="any"
            value={form.amount}
            onChange={update('amount')}
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${ids}-item`}>Item</label>
          <input id={`${ids}-item`} type="text" maxLength={200} value={form.item} onChange={update('item')} />
        </div>
        <div className="form-group">
          <label htmlFor={`${ids}-date`}>Date</label>
          <input id={`${ids}-date`} type="date" value={form.date} onChange={update('date')} />
        </div>
        <div className="form-group">
          <label htmlFor={`${ids}-category`}>Category</label>
          <select id={`${ids}-category`} value={form.category} onChange={update('category')}>
            {Object.values(CATEGORIES).map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.emoji} {cat.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={`${ids}-people`}>People (comma-separated)</label>
          <input id={`${ids}-people`} type="text" maxLength={300} value={form.people} onChange={update('people')} />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-accent" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteExpenseModal({ expense, onConfirm, onClose }) {
  const cancelRef = useRef(null);
  return (
    <Modal
      title="Delete expense?"
      onClose={onClose}
      initialFocusRef={cancelRef}
      className="modal-center"
      actions={
        <>
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-accent btn-confirm-danger" onClick={onConfirm}>Delete</button>
        </>
      }
    >
      <p>
        <strong>{expense.item || getCategoryLabel(expense.category)}</strong> ·{' '}
        {formatAmount(expense.amount, expense.currency)} on {formatDay(expense.date)}.
        <br />
        This can’t be undone.
      </p>
    </Modal>
  );
}

function ExpensesPage() {
  const { expenses, loading, removeExpense, editExpense } = useExpenses();
  const { currency: preferredCurrency } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const ids = useId();

  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const currency = searchParams.get('currency') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const sort = SORTS[searchParams.get('sort')] ? searchParams.get('sort') : 'newest';

  const activeFilters = FILTER_PARAMS.filter((p) => searchParams.get(p) && !(p === 'sort' && sort === 'newest')).length;
  const [filtersOpen, setFiltersOpen] = useState(activeFilters > 0);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const currencies = useMemo(() => currencyBreakdown(expenses).map((c) => c.currency), [expenses]);

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

  const setParam = (name, value) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(name, value);
        else next.delete(name);
        return next;
      },
      { replace: true },
    );
  };

  const clearAll = () => setSearchParams({}, { replace: true });
  const isFiltered = Boolean(q) || activeFilters > 0;

  return (
    <div className="expenses-page page-container">
      <section className="recent-section">
        <div className="section-header">
          <h1 className="page-title">All expenses</h1>
          {!loading && expenses.length > 0 && <span className="expenses-count">{expenses.length}</span>}
        </div>

        {!loading && expenses.length > 0 && (
          <>
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
                  onChange={(e) => setParam('q', e.target.value)}
                />
              </div>
              <button
                type="button"
                className={`btn-secondary filter-toggle ${activeFilters ? 'has-filters' : ''}`}
                aria-expanded={filtersOpen}
                aria-controls={`${ids}-filters`}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filters{activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
              </button>
            </div>

            {filtersOpen && (
              <div id={`${ids}-filters`} className="glass-card filter-panel">
                <div className="form-group">
                  <label htmlFor={`${ids}-category`}>Category</label>
                  <select id={`${ids}-category`} value={category} onChange={(e) => setParam('category', e.target.value)}>
                    <option value="">All categories</option>
                    {Object.values(CATEGORIES).map((cat) => (
                      <option key={cat.key} value={cat.key}>{cat.emoji} {cat.label}</option>
                    ))}
                  </select>
                </div>
                {currencies.length > 1 && (
                  <div className="form-group">
                    <label htmlFor={`${ids}-currency`}>Currency</label>
                    <select id={`${ids}-currency`} value={currency} onChange={(e) => setParam('currency', e.target.value)}>
                      <option value="">All currencies</option>
                      {currencies.map((code) => (
                        <option key={code} value={code}>{CURRENCIES[code]?.symbol} {code}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor={`${ids}-from`}>From</label>
                  <input id={`${ids}-from`} type="date" value={from} max={to || undefined} onChange={(e) => setParam('from', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor={`${ids}-to`}>To</label>
                  <input id={`${ids}-to`} type="date" value={to} min={from || undefined} onChange={(e) => setParam('to', e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor={`${ids}-sort`}>Sort</label>
                  <select id={`${ids}-sort`} value={sort} onChange={(e) => setParam('sort', e.target.value === 'newest' ? '' : e.target.value)}>
                    {Object.entries(SORTS).map(([value, { label }]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <p className="filter-summary" role="status">
              {isFiltered ? `${filtered.length} of ${expenses.length}` : `${expenses.length} expenses`}
              {filtered.length > 0 && <> · {formatTotals(sumByCurrency(filtered), preferredCurrency)}</>}
              {isFiltered && (
                <>
                  {' · '}
                  <button type="button" className="btn-link" onClick={clearAll}>Clear filters</button>
                </>
              )}
            </p>
          </>
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
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-text">No expenses yet. Add one from the Home tab!</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-text">No expenses match these filters.</div>
            <button type="button" className="btn-secondary" onClick={clearAll}>Clear filters</button>
          </div>
        ) : (
          <div className="expense-list">
            {filtered.map((expense, index) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                style={{ animationDelay: `${Math.min(index, 12) * 50}ms` }}
                onEdit={setEditing}
                onDelete={(id) => setDeleting(expenses.find((e) => e.id === id) ?? null)}
              />
            ))}
          </div>
        )}
      </section>

      {deleting && (
        <DeleteExpenseModal
          expense={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            removeExpense(deleting.id).catch((err) => logError('Failed to delete expense', err));
            setDeleting(null);
          }}
        />
      )}

      {editing && (
        <EditExpenseModal
          expense={editing}
          onClose={() => setEditing(null)}
          onSave={(updates) => editExpense(editing.id, updates)}
        />
      )}
    </div>
  );
}

export default ExpensesPage;
