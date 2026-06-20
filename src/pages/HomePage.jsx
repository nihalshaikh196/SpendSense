import { useState, useEffect, useMemo, useRef } from 'react';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { parseExpense } from '../lib/parser.js';
import { formatAmount } from '../lib/currency.js';
import { getCategoryEmoji, getCategoryLabel, CATEGORIES } from '../lib/categories.js';
import './HomePage.css';

function HomePage() {
  const { addNewExpense } = useExpenses();
  const { currency } = useSettings();
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
    return parseExpense(inputText, currency);
  }, [inputText, currency]);

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
        <h1 className="app-logo-text">SpendSense</h1>
        
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
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
