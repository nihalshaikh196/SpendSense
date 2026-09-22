import { useId, useRef, useState } from 'react';
import { CATEGORIES } from '../lib/categories.js';
import { logError } from '../lib/log.js';
import Modal from './Modal.jsx';

/**
 * Edit every field of an expense. Validates before saving so the record
 * always passes the Firestore rules (positive amount, real date).
 *
 * @param {Object}   props
 * @param {Object}   props.expense
 * @param {(updates: Object) => Promise<*>} props.onSave
 * @param {(expense: Object) => void} [props.onDelete] - Shows a Delete button
 * @param {() => void} props.onClose
 */
function EditExpenseModal({ expense, onSave, onDelete, onClose }) {
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
      amountRef.current?.focus();
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
            aria-invalid={Boolean(error) && error.includes('amount')}
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${ids}-item`}>Item</label>
          <input id={`${ids}-item`} type="text" maxLength={200} value={form.item} onChange={update('item')} />
        </div>
        <div className="form-row">
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
        </div>
        <div className="form-group">
          <label htmlFor={`${ids}-people`}>People (comma-separated)</label>
          <input id={`${ids}-people`} type="text" maxLength={300} value={form.people} onChange={update('people')} />
        </div>
        {expense.raw && (
          <p className="edit-original">
            You typed: <q>{expense.raw}</q>
          </p>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className={`modal-actions ${onDelete ? 'modal-actions-split' : ''}`}>
          {onDelete && (
            <button
              type="button"
              className="btn-link btn-link-danger"
              onClick={() => {
                onClose();
                onDelete(expense);
              }}
            >
              Delete
            </button>
          )}
          <div className="modal-actions-group">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-accent" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default EditExpenseModal;
