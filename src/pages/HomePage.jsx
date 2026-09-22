import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { parseExpenses } from '../lib/parser.js';
import { formatAmount, formatTotals } from '../lib/currency.js';
import { getCategoryEmoji, getCategoryLabel } from '../lib/categories.js';
import { sumByCurrency, todayString } from '../lib/analytics.js';
import { logError } from '../lib/log.js';
import ExpenseCard from '../components/ExpenseCard.jsx';
import './HomePage.css';

/** Matches the Firestore rule on `raw`, with headroom. */
const MAX_INPUT_LENGTH = 500;

function PreviewPill({ parsed, fallbackCurrency }) {
  return (
    <div className={`preview-pill ${!parsed.amount ? 'muted' : ''}`}>
      <div className="preview-pill-amount">
        {formatAmount(parsed.amount || 0, parsed.amount ? parsed.currency : fallbackCurrency)}
      </div>
      <div className="preview-pill-divider"></div>
      <div className="preview-pill-details">
        <span className="preview-pill-cat">
          {getCategoryEmoji(parsed.category)} {getCategoryLabel(parsed.category)}
        </span>
        {parsed.item && (
          <>
            <span className="preview-pill-dot">•</span>
            <span className="preview-pill-item">{parsed.item}</span>
          </>
        )}
        {parsed.people && parsed.people.length > 0 && (
          <>
            <span className="preview-pill-dot">•</span>
            <span className="preview-pill-item">with {parsed.people.join(', ')}</span>
          </>
        )}
        {parsed.date && (
          <>
            <span className="preview-pill-dot">•</span>
            <span className="preview-pill-item">{parsed.date}</span>
          </>
        )}
      </div>
    </div>
  );
}

function HomePage() {
  const { addNewExpense, expenses } = useExpenses();
  const { currency, userName } = useSettings();
  const { user } = useAuth();
  const [inputText, setInputText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 60)}px`;
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
  const canAdd = parsedItems.length > 0 && parsedItems.every((p) => p.amount);

  // Totals stay per currency: ₹500 and $50 are shown side by side, not as 550.
  const summary = useMemo(() => {
    const today = todayString();
    const monthPrefix = today.slice(0, 7);
    return {
      today: sumByCurrency(expenses.filter((e) => e.date === today)),
      month: sumByCurrency(expenses.filter((e) => e.date?.startsWith(monthPrefix))),
    };
  }, [expenses]);

  const recent = useMemo(() => expenses.slice(0, 5), [expenses]);

  const handleAddExpense = async () => {
    if (!canAdd || isAdding) return;

    setIsAdding(true);
    try {
      for (const parsed of parsedItems) {
        await addNewExpense(parsed);
      }
      setInputText('');
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

  return (
    <div className="home-page page-container">
      {/* ─── Hero Input Area ─── */}
      <section className="hero-section">
        <div className="hero-header">
          <h1 className="app-logo-text">SpendSense</h1>
          {!user && <span className="local-mode-badge" title="Expenses are saved on this device. Login in Settings to sync.">☁️ Local Mode</span>}
        </div>

        <div className="expense-input-wrapper">
          <div className={`expense-input-container ${inputText.trim() ? 'has-input' : ''}`}>
            <textarea
              ref={textareaRef}
              className="expense-input"
              placeholder="e.g., $15 for lunch with Sarah"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={MAX_INPUT_LENGTH}
              aria-label="Describe an expense"
              autoFocus
            />
            <button
              className="btn-submit-icon"
              onClick={handleAddExpense}
              disabled={!canAdd || isAdding}
              aria-label={parsedItems.length > 1 ? `Add ${parsedItems.length} expenses` : 'Add expense'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>

          {/* Minimalist Preview Pill(s) */}
          <div className={`preview-pill-container ${parsedItems.length ? 'visible' : ''}`}>
            {parsedItems.length > 1 && (
              <div className="preview-multi-label">
                {parsedItems.length} expenses ·{' '}
                {formatTotals(sumByCurrency(parsedItems.map((p) => ({ ...p, amount: p.amount || 0 }))), currency)}
              </div>
            )}
            {parsedItems.map((parsed, i) => (
              <PreviewPill key={i} parsed={parsed} fallbackCurrency={currency} />
            ))}
            {inputText.trim() && parsedItems.length > 0 && !canAdd && (
              <div className="helper-text-amount">Please include an amount (e.g. "50") to add this expense.</div>
            )}
          </div>
        </div>
      </section>

      {/* ─── At-a-glance panel (wide screens only) ─── */}
      <section className="home-panel">
        <div className="home-summary">
          <div className="glass-card home-stat">
            <span className="home-stat-label">Today</span>
            <span className="home-stat-value">{formatTotals(summary.today, currency)}</span>
          </div>
          <div className="glass-card home-stat">
            <span className="home-stat-label">This Month</span>
            <span className="home-stat-value">{formatTotals(summary.month, currency)}</span>
          </div>
        </div>

        <div className="home-recent">
          <div className="section-header">
            <h2>Recent</h2>
            <Link to="/expenses" className="home-see-all">See all</Link>
          </div>
          {recent.length > 0 ? (
            <div className="expense-list">
              {recent.map((expense, index) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  style={{ animationDelay: `${index * 50}ms` }}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card home-recent-empty">
              <span className="empty-state-text">Nothing logged yet — type above to add your first expense.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default HomePage;
