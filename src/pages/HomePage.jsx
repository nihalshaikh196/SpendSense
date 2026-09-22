import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useExpenseActions } from '../hooks/useExpenseActions.js';
import { parseExpenses } from '../lib/parser.js';
import { formatAmount, formatTotals, getCurrencySymbol } from '../lib/currency.js';
import { CATEGORIES, getCategoryEmoji, getCategoryLabel } from '../lib/categories.js';
import {
  comparisonLabel,
  comparisonWindow,
  currentPeriod,
  elapsedDays,
  frequentItems,
  greetingFor,
  inCurrency,
  inPeriod,
  inRange,
  percentChange,
  periodBounds,
  relativeDay,
  spanDays,
  sumByCurrency,
  todayString,
  trackingStart,
  wasTracked,
} from '../lib/analytics.js';
import { logError } from '../lib/log.js';
import ExpenseCard from '../components/ExpenseCard.jsx';
import EditExpenseModal from '../components/EditExpenseModal.jsx';
import { Delta } from '../components/dashboard/StatTile.jsx';
import './HomePage.css';

/** Matches the Firestore rule on `raw`, with headroom. */
const MAX_INPUT_LENGTH = 500;

/** Shown until there's enough history to suggest the user's own items. */
const EXAMPLES = [
  'chai 20',
  'uber 250 to airport',
  'lunch 400 with Priya yesterday',
  'coffee 120 and sandwich 80',
];

const NO_OVERRIDES = { count: 0, byIndex: {} };

function Caret() {
  return (
    <svg className="chip-caret" viewBox="0 0 12 8" width="10" height="7" aria-hidden="true">
      <path d="M1 1.5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * What the parser understood, before saving. Category and date are chips
 * that open a picker, so a wrong guess is fixed with one tap instead of
 * retyping the sentence or editing after the fact.
 */
function PreviewCard({ item, today, fallbackCurrency, onChange }) {
  const name = item.item || getCategoryLabel(item.category);
  return (
    <div className={`preview-pill ${!item.amount ? 'muted' : ''}`}>
      <div className="preview-pill-amount">
        {formatAmount(item.amount || 0, item.amount ? item.currency : fallbackCurrency)}
      </div>
      <div className="preview-pill-details">
        <span className="preview-pill-title">{item.item || <em>No description</em>}</span>
        <div className="preview-chips">
          <label className="pill-chip" title="Change category">
            <span aria-hidden="true">{getCategoryEmoji(item.category)}</span>
            {getCategoryLabel(item.category)}
            <Caret />
            <select
              aria-label={`Category for ${name}`}
              value={item.category}
              onChange={(e) => onChange({ category: e.target.value })}
            >
              {Object.values(CATEGORIES).map((cat) => (
                <option key={cat.key} value={cat.key}>{cat.emoji} {cat.label}</option>
              ))}
            </select>
          </label>
          <label className="pill-chip" title="Change date">
            <span aria-hidden="true">📅</span>
            {relativeDay(item.date, today)}
            <Caret />
            <input
              type="date"
              aria-label={`Date for ${name}`}
              value={item.date}
              max={today}
              onChange={(e) => e.target.value && onChange({ date: e.target.value })}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  // Not allowed in this context — the native control still works
                }
              }}
            />
          </label>
          {item.people?.length > 0 && (
            <span className="pill-chip pill-chip-static">
              <span aria-hidden="true">👥</span> {item.people.join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function HomePage() {
  const { expenses, loading } = useExpenses();
  const { currency, userName, budgets } = useSettings();
  const { user } = useAuth();
  const { addWithUndo, deleteWithUndo, saveWithUndo } = useExpenseActions();
  const [inputText, setInputText] = useState('');
  const [overrides, setOverrides] = useState(NO_OVERRIDES);
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const textareaRef = useRef(null);

  const today = todayString();
  const now = new Date();

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 56)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [inputText]);

  // Parse input on the fly. One sentence can hold several expenses
  // ("coffee 120 and sandwich 80"); each gets its own preview and record.
  const parsedItems = useMemo(() => {
    if (!inputText.trim()) return [];
    return parseExpenses(inputText, currency, userName);
  }, [inputText, currency, userName]);

  // Chip corrections survive small edits to the text, but not a change in
  // how many expenses it describes — then indices no longer line up.
  const items = parsedItems.map((p, i) =>
    overrides.count === parsedItems.length ? { ...p, ...overrides.byIndex[i] } : p,
  );
  const canAdd = items.length > 0 && items.every((p) => p.amount);

  const setOverride = (index, change) => {
    setOverrides((prev) => {
      const byIndex = prev.count === parsedItems.length ? prev.byIndex : {};
      return { count: parsedItems.length, byIndex: { ...byIndex, [index]: { ...byIndex[index], ...change } } };
    });
  };

  const fillInput = (text) => {
    setInputText(text);
    setOverrides(NO_OVERRIDES);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  // The user's own repeat purchases once there are any; examples until then.
  const suggestions = useMemo(() => {
    const frequent = frequentItems(expenses, today);
    if (frequent.length >= 2) {
      return {
        title: 'Log again',
        // No settled price: fill just the item and leave the cursor for the amount.
        chips: frequent.map((f) => ({
          key: f.key,
          label: `${getCategoryEmoji(f.category)} ${f.label}${f.amount ? ` · ${formatAmount(f.amount, f.currency)}` : ''}`,
          text: f.amount
            ? `${f.label} ${f.currency === currency ? '' : getCurrencySymbol(f.currency)}${f.amount}`
            : `${f.label} `,
        })),
      };
    }
    return {
      title: 'Try',
      chips: EXAMPLES.map((text) => ({ key: text, label: text, text })),
    };
  }, [expenses, today, currency]);

  // Totals stay per currency: ₹500 and $50 are shown side by side, not as 550.
  const glance = useMemo(() => {
    const period = currentPeriod('month');
    const { start, days } = periodBounds(period);
    const elapsed = elapsedDays(period, today);
    const trackedSince = trackingStart(expenses);
    const todayItems = expenses.filter((e) => e.date === today);
    const monthAll = inPeriod(expenses, period);
    const monthTotal = sumByCurrency(inCurrency(monthAll, currency))[currency] ?? 0;
    const todayTotal = sumByCurrency(inCurrency(todayItems, currency))[currency] ?? 0;

    // "Usual" is the average over tracked days before today — not the whole
    // month, which would make a first-day user's usual look like ₹9.
    const countFrom = trackedSince && trackedSince > start ? trackedSince : start;
    const priorDays = trackedSince && trackedSince < today ? spanDays(countFrom, today) - 1 : 0;

    const window = comparisonWindow(period, today);
    const previous = wasTracked(window.start, trackedSince)
      ? sumByCurrency(inCurrency(inRange(expenses, window.start, window.end), currency))[currency] ?? 0
      : null;

    return {
      todayTotals: sumByCurrency(todayItems),
      todayCount: todayItems.length,
      monthTotals: sumByCurrency(monthAll),
      monthCount: monthAll.length,
      monthTotal,
      usualPerDay: priorDays >= 3 ? (monthTotal - todayTotal) / priorDays : null,
      change: previous === null ? undefined : percentChange(monthTotal, previous),
      compareName: comparisonLabel(window),
      daysLeft: days - elapsed,
    };
  }, [expenses, currency, today]);

  const budget = budgets[currency];
  const budgetLeft = budget ? budget - glance.monthTotal : null;

  const recent = useMemo(
    () => [...expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6),
    [expenses],
  );

  const handleAddExpense = async () => {
    if (!canAdd || isAdding) return;

    setIsAdding(true);
    try {
      await addWithUndo(items);
      setInputText('');
      setOverrides(NO_OVERRIDES);
      textareaRef.current?.focus();
    } catch (err) {
      logError('Failed to add expense', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddExpense();
    }
  };

  const greeting = `${greetingFor(now.getHours())}${userName ? `, ${userName}` : ''}`;
  const multiTotal = formatTotals(sumByCurrency(items.map((p) => ({ ...p, amount: p.amount || 0 }))), currency);

  return (
    <div className="home-page page-container">
      {/* ─── Header ─── */}
      <header className="home-header">
        <div className="home-header-row">
          <span className="home-brand">SpendSense</span>
          {!user && (
            <Link to="/settings" className="local-mode-badge" title="Expenses are saved on this device. Sign in from Settings to back up and sync.">
              Saved on this device
            </Link>
          )}
        </div>
        <h1 className="home-greeting">{greeting}</h1>
        <p className="home-date">
          {now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      {/* ─── Input ─── */}
      <section className="hero-section" aria-label="Add an expense">
        <div className={`expense-input-container ${inputText.trim() ? 'has-input' : ''}`}>
          <textarea
            ref={textareaRef}
            className="expense-input"
            placeholder="What did you spend? e.g. lunch 250 with Raj"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={MAX_INPUT_LENGTH}
            aria-label="Describe an expense"
            aria-describedby="input-hint"
            autoFocus
          />
          <button
            className="btn-submit-icon"
            onClick={handleAddExpense}
            disabled={!canAdd || isAdding}
            aria-label={items.length > 1 ? `Add ${items.length} expenses` : 'Add expense'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>

        {items.length > 0 ? (
          <div className="preview-area">
            {items.length > 1 && (
              <div className="preview-multi-label">{items.length} expenses · {multiTotal}</div>
            )}
            {items.map((item, i) => (
              <PreviewCard
                key={i}
                item={item}
                today={today}
                fallbackCurrency={currency}
                onChange={(change) => setOverride(i, change)}
              />
            ))}
            {canAdd ? (
              <p id="input-hint" className="input-hint">
                Tap the category or date to change it.
                <span className="input-hint-keys"> Press <kbd>Enter</kbd> to add.</span>
              </p>
            ) : (
              <p id="input-hint" className="helper-text-amount">
                Add an amount to save this — e.g. “{items.find((p) => !p.amount)?.item || 'coffee'} 50”.
              </p>
            )}
          </div>
        ) : (
          <div className="suggestions">
            <p id="input-hint" className="input-hint">
              Type it like a message — amount, what, who, when. Several at once works too.
            </p>
            <div className="suggestion-row" role="group" aria-label={suggestions.title}>
              <span className="suggestion-title">{suggestions.title}</span>
              {suggestions.chips.map((chip) => (
                <button key={chip.key} type="button" className="suggestion-chip" onClick={() => fillInput(chip.text)}>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ─── At a glance ─── */}
      <section className="home-panel" aria-label="Summary">
        <div className="home-summary">
          <div className="glass-card home-stat">
            <span className="home-stat-label">Today</span>
            <span className="home-stat-value">{formatTotals(glance.todayTotals, currency)}</span>
            <span className="home-stat-sub">
              {glance.todayCount === 0
                ? 'Nothing logged yet today'
                : `${glance.todayCount} expense${glance.todayCount === 1 ? '' : 's'}`}
              {glance.usualPerDay > 0 && ` · usually ${formatAmount(Math.round(glance.usualPerDay), currency)}/day`}
            </span>
          </div>

          <Link to="/dashboard" className="glass-card home-stat home-stat-link">
            <span className="home-stat-label">This month</span>
            <span className="home-stat-value">{formatTotals(glance.monthTotals, currency)}</span>
            {glance.change !== undefined && glance.monthTotal > 0 && (
              <Delta pct={glance.change} against={glance.compareName} />
            )}
            {budget ? (
              <>
                <span
                  className={`home-meter ${budgetLeft < 0 ? 'is-over' : ''}`}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={budget}
                  aria-valuenow={Math.min(glance.monthTotal, budget)}
                  aria-label={`Budget used: ${Math.round((glance.monthTotal / budget) * 100)}%`}
                >
                  <span style={{ width: `${Math.min(glance.monthTotal / budget, 1) * 100}%` }} />
                </span>
                <span className="home-stat-sub">
                  {budgetLeft < 0
                    ? `${formatAmount(Math.round(-budgetLeft), currency)} over budget`
                    : `${formatAmount(Math.round(budgetLeft), currency)} left` +
                      (glance.daysLeft > 0 ? ` · ${formatAmount(Math.floor(budgetLeft / glance.daysLeft), currency)}/day` : '')}
                </span>
              </>
            ) : (
              <span className="home-stat-sub">
                {glance.monthCount} expense{glance.monthCount === 1 ? '' : 's'} · Set a budget in the report →
              </span>
            )}
          </Link>
        </div>

        <div className="home-recent">
          <div className="section-header">
            <h2>Recently added</h2>
            {expenses.length > 0 && <Link to="/expenses" className="home-see-all">See all {expenses.length}</Link>}
          </div>
          {loading ? null : recent.length > 0 ? (
            <div className="expense-list">
              {recent.map((expense, index) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  today={today}
                  style={{ animationDelay: `${index * 40}ms` }}
                  onOpen={setEditing}
                  onDelete={deleteWithUndo}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card home-recent-empty">
              <p className="home-empty-title">Nothing logged yet</p>
              <ul className="home-tips">
                <li>Dates work: <em>yesterday</em>, <em>last friday</em>, <em>15th june</em></li>
                <li>Name people: <em>dinner 1200 with Priya and Amit</em></li>
                <li>Other currencies: <em>$15 lunch</em>, <em>20 euros taxi</em></li>
              </ul>
            </div>
          )}
        </div>
      </section>

      {editing && (
        <EditExpenseModal
          expense={editing}
          onSave={(updates) => saveWithUndo(editing, updates)}
          onDelete={deleteWithUndo}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default HomePage;
