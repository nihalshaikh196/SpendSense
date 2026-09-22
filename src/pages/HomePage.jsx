import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { parseExpense } from '../lib/parser.js';
import { formatAmount } from '../lib/currency.js';
import { getCategoryEmoji, getCategoryLabel } from '../lib/categories.js';
import ExpenseCard from '../components/ExpenseCard.jsx';
import './HomePage.css';

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  // Parse input on the fly
  const parsedPreview = useMemo(() => {
    if (!inputText.trim()) return null;
    return parseExpense(inputText, currency, userName);
  }, [inputText, currency, userName]);

  const summary = useMemo(() => {
    const today = todayString();
    const monthPrefix = today.slice(0, 7);
    let todayTotal = 0;
    let monthTotal = 0;
    for (const e of expenses) {
      const amount = e.amount || 0;
      if (e.date === today) todayTotal += amount;
      if (e.date?.startsWith(monthPrefix)) monthTotal += amount;
    }
    return {
      today: Math.round(todayTotal * 100) / 100,
      month: Math.round(monthTotal * 100) / 100,
    };
  }, [expenses]);

  const recent = useMemo(() => expenses.slice(0, 5), [expenses]);

  const handleAddExpense = async () => {
    if (!parsedPreview || !parsedPreview.amount) return;

    setIsAdding(true);
    try {
      await addNewExpense(parsedPreview);
      setInputText('');
    } catch (err) {
      console.error('Failed to add expense', err);
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
              autoFocus
            />
            <button
              className="btn-submit-icon"
              onClick={handleAddExpense}
              disabled={!parsedPreview || !parsedPreview.amount || isAdding}
              aria-label="Add Expense"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>

          {/* Minimalist Preview Pill */}
          <div className={`preview-pill-container ${parsedPreview ? 'visible' : ''}`}>
            {parsedPreview && (
              <div className={`preview-pill ${!parsedPreview.amount ? 'muted' : ''}`}>
                <div className="preview-pill-amount">
                  {parsedPreview.amount ? formatAmount(parsedPreview.amount, parsedPreview.currency) : formatAmount(0, currency)}
                </div>
                <div className="preview-pill-divider"></div>
                <div className="preview-pill-details">
                  <span className="preview-pill-cat">
                    {getCategoryEmoji(parsedPreview.category)} {getCategoryLabel(parsedPreview.category)}
                  </span>
                  {parsedPreview.item && (
                    <>
                      <span className="preview-pill-dot">•</span>
                      <span className="preview-pill-item">{parsedPreview.item}</span>
                    </>
                  )}
                  {parsedPreview.people && parsedPreview.people.length > 0 && (
                    <>
                      <span className="preview-pill-dot">•</span>
                      <span className="preview-pill-item">with {parsedPreview.people.join(', ')}</span>
                    </>
                  )}
                  {parsedPreview.date && (
                    <>
                      <span className="preview-pill-dot">•</span>
                      <span className="preview-pill-item">{parsedPreview.date}</span>
                    </>
                  )}
                </div>
              </div>
            )}
            {inputText.trim() && parsedPreview && !parsedPreview.amount && (
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
            <span className="home-stat-value">{formatAmount(summary.today, currency)}</span>
          </div>
          <div className="glass-card home-stat">
            <span className="home-stat-label">This Month</span>
            <span className="home-stat-value">{formatAmount(summary.month, currency)}</span>
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
