import { useState } from 'react';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatAmount } from '../lib/currency.js';
import { getCategoryEmoji, getCategoryLabel, CATEGORIES } from '../lib/categories.js';
import './HomePage.css'; // Reusing styles from HomePage.css for now

function ExpensesPage() {
  const { expenses, loading, removeExpense, editExpense } = useExpenses();
  const { currency } = useSettings();
  
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    amount: '', item: '', date: '', category: '', people: ''
  });

  const handleEditClick = (expense) => {
    setEditingExpense(expense);
    setEditFormData({
      amount: expense.amount,
      item: expense.item,
      date: expense.date,
      category: expense.category,
      people: expense.people.join(', ')
    });
  };

  const handleSaveEdit = async () => {
    try {
      await editExpense(editingExpense.id, {
        amount: parseFloat(editFormData.amount) || 0,
        item: editFormData.item,
        date: editFormData.date,
        category: editFormData.category,
        people: editFormData.people.split(',').map(p => p.trim()).filter(Boolean)
      });
      setEditingExpense(null);
    } catch (err) {
      console.error('Failed to save edit', err);
    }
  };

  return (
    <div className="page-container">
      <section className="recent-section" style={{ height: '100%', overflowY: 'auto', paddingBottom: '80px' }}>
        <div className="section-header">
          <h2>All Expenses</h2>
        </div>

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
        ) : (
          <div className="expense-list">
            {expenses.map((expense, index) => (
              <div
                key={expense.id}
                className="glass-card expense-card"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="expense-card-left">
                  <div className="expense-emoji">{getCategoryEmoji(expense.category)}</div>
                  <div className="expense-details">
                    <div className="expense-title-row">
                      <span className="expense-title">{expense.item || getCategoryLabel(expense.category)}</span>
                    </div>
                    <div className="expense-subtitle">
                      <span>{expense.date}</span>
                      {expense.people && expense.people.length > 0 && (
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
                  <div className="expense-actions">
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => handleEditClick(expense)}
                      aria-label="Edit expense"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => setDeletingExpenseId(expense.id)}
                      aria-label="Delete expense"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Delete Confirmation Modal ─── */}
      {deletingExpenseId && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h2>Delete Expense?</h2>
            <p style={{ margin: '20px 0', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete this expense? This action cannot be undone.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeletingExpenseId(null)}>Cancel</button>
              <button 
                className="btn-accent" 
                style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                onClick={() => {
                  removeExpense(deletingExpenseId);
                  setDeletingExpenseId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Modal ─── */}
      {editingExpense && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content">
            <h2>Edit Expense</h2>
            <div className="edit-form">
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="number"
                  value={editFormData.amount}
                  onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Item</label>
                <input
                  type="text"
                  value={editFormData.item}
                  onChange={(e) => setEditFormData({ ...editFormData, item: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={editFormData.date}
                  onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={editFormData.category}
                  onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                >
                  {Object.values(CATEGORIES).map(cat => (
                    <option key={cat.key} value={cat.key}>
                      {cat.emoji} {cat.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>People (comma-separated)</label>
                <input
                  type="text"
                  value={editFormData.people}
                  onChange={(e) => setEditFormData({ ...editFormData, people: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingExpense(null)}>Cancel</button>
              <button className="btn-accent" onClick={handleSaveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpensesPage;
