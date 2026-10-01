import { useId, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import { todayString } from '../../lib/analytics.js';

const num = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

/** A goal: a target amount by a date. Holdings are linked to it from their own form. */
function GoalForm({ goal, currency, onSave, onDelete, onClose }) {
  const ids = useId();
  const nameRef = useRef(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: goal?.name ?? '',
    target: goal?.target ?? '',
    targetDate: goal?.targetDate ?? '',
    expectedReturn: goal?.expectedReturn ?? '',
  });

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const target = num(form.target);
    const expectedReturn = num(form.expectedReturn);
    if (!form.name.trim()) {
      setError('Name the goal.');
      nameRef.current?.focus();
      return;
    }
    if (target !== null && !(target > 0)) return setError('Target should be more than zero.');
    if (expectedReturn !== null && !(expectedReturn >= -100 && expectedReturn <= 100)) {
      return setError('Expected return should be between −100 and 100%.');
    }
    try {
      await onSave({
        ...(goal ?? {}),
        name: form.name.trim(),
        target,
        targetDate: form.targetDate || null,
        expectedReturn,
      });
      onClose();
    } catch {
      setError('Couldn’t save. Try again.');
    }
  };

  return (
    <Modal title={goal ? 'Edit goal' : 'New goal'} onClose={onClose} initialFocusRef={nameRef}>
      <form className="edit-form" onSubmit={submit} noValidate>
        <div className="form-group">
          <label htmlFor={`${ids}-name`}>Goal</label>
          <input id={`${ids}-name`} ref={nameRef} type="text" maxLength={80} placeholder="Retirement, House, Emergency fund…" value={form.name} onChange={set('name')} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor={`${ids}-target`}>Target ({currency})</label>
            <input id={`${ids}-target`} type="number" inputMode="decimal" min="0" step="any" value={form.target} onChange={set('target')} />
          </div>
          <div className="form-group">
            <label htmlFor={`${ids}-date`}>By</label>
            <input id={`${ids}-date`} type="date" min={todayString()} value={form.targetDate} onChange={set('targetDate')} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor={`${ids}-return`}>Expected return (% a year, optional)</label>
          <input id={`${ids}-return`} type="number" inputMode="decimal" step="any" placeholder="Leave empty to assume no growth" value={form.expectedReturn} onChange={set('expectedReturn')} />
          <p className="form-hint">
            Your own assumption, used only to estimate how much to put in each month. SpendSense doesn’t predict returns.
          </p>
        </div>
        <p className="form-hint">Link investments to this goal from each investment’s Edit screen.</p>

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className={`modal-actions ${onDelete ? 'modal-actions-split' : ''}`}>
          {onDelete && (
            <button type="button" className="btn-link btn-link-danger" onClick={() => { onClose(); onDelete(); }}>
              Delete
            </button>
          )}
          <div className="modal-actions-group">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-accent">Save</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default GoalForm;
