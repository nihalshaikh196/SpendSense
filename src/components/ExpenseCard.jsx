import { formatAmount } from '../lib/currency.js';
import { getCategoryEmoji, getCategoryLabel } from '../lib/categories.js';

function ExpenseCard({ expense, style, onEdit, onDelete }) {
  return (
    <div className="glass-card expense-card" style={style}>
      <div className="expense-card-left">
        <div className="expense-emoji">{getCategoryEmoji(expense.category)}</div>
        <div className="expense-details">
          <div className="expense-title-row">
            <span className="expense-title">
              {expense.item || getCategoryLabel(expense.category)}
            </span>
          </div>
          <div className="expense-subtitle">
            <span>{expense.date}</span>
            {expense.people?.length > 0 && (
              <>
                <span>•</span>
                <span>{expense.people.join(', ')}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="expense-card-right">
        <div className="expense-amount">
          {formatAmount(expense.amount, expense.currency)}
        </div>
        {(onEdit || onDelete) && (
          <div className="expense-actions">
            {onEdit && (
              <button className="btn-icon btn-edit" onClick={() => onEdit(expense)} aria-label="Edit expense">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
            {onDelete && (
              <button className="btn-icon btn-delete" onClick={() => onDelete(expense.id)} aria-label="Delete expense">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExpenseCard;
