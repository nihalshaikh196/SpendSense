import { useState } from 'react';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { CATEGORIES } from '../lib/categories.js';
import ExpenseCard from '../components/ExpenseCard.jsx';
import './HomePage.css';
import './ExpensesPage.css';

function ExpensesPage() {
  const { expenses, loading, removeExpense, editExpense } = useExpenses();

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
    <div className="expenses-page page-container">
      <section className="recent-section">
        <div className="section-header">
          <h2>All Expenses</h2>
          {!loading && expenses.length > 0 && (
            <span className="expenses-count">{expenses.length}</span>
          )}
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
              <ExpenseCard
                key={expense.id}
                expense={expense}
                style={{ animationDelay: `${Math.min(index, 12) * 50}ms` }}
                onEdit={handleEditClick}
                onDelete={setDeletingExpenseId}
              />
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
