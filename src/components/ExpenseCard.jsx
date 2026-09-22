import { formatAmount } from '../lib/currency.js';
import { getCategoryEmoji, getCategoryLabel } from '../lib/categories.js';
import { relativeDay } from '../lib/analytics.js';
import './ExpenseCard.css';

/**
 * One expense in a list. With `onOpen` the whole card is a button that opens
 * the editor — a much bigger target than a pencil icon, and reachable by
 * keyboard. `showDate` is off inside day-grouped lists, where the group
 * header already says which day it is.
 */
function ExpenseCard({ expense, style, onOpen, onDelete, showDate = true, today }) {
  const title = expense.item || getCategoryLabel(expense.category);
  const amount = formatAmount(expense.amount, expense.currency);
  const meta = [
    showDate && relativeDay(expense.date, today),
    getCategoryLabel(expense.category),
    expense.people?.length > 0 && `with ${expense.people.join(', ')}`,
  ].filter(Boolean);

  const content = (
    <>
      <span className="expense-emoji" aria-hidden="true">{getCategoryEmoji(expense.category)}</span>
      <span className="expense-details">
        <span className="expense-title">{title}</span>
        <span className="expense-subtitle">{meta.join(' · ')}</span>
      </span>
      <span className="expense-amount">{amount}</span>
    </>
  );

  return (
    <div className="glass-card expense-card" style={style}>
      {onOpen ? (
        <button
          type="button"
          className="expense-card-main"
          onClick={() => onOpen(expense)}
          aria-label={`${title}, ${amount}, ${meta.join(', ')}. Edit`}
        >
          {content}
        </button>
      ) : (
        <div className="expense-card-main">{content}</div>
      )}
      {onDelete && (
        <button
          type="button"
          className="btn-icon btn-delete"
          onClick={() => onDelete(expense)}
          aria-label={`Delete ${title}, ${amount}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default ExpenseCard;
