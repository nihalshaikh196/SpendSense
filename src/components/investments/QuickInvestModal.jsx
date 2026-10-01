import { useId, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import { formatAmount } from '../../lib/currency.js';
import { todayString } from '../../lib/analytics.js';
import { guessHolding, typeInfo } from '../../lib/investments.js';

/**
 * Arrives from Home ("added 180 in zerodha"): pick which holding the money
 * went into — the likeliest is preselected — or start a new one.
 */
function QuickInvestModal({ amount, date, text, currency, holdings, onSave, onNewHolding, onClose }) {
  const ids = useId();
  const selectRef = useRef(null);
  const active = holdings.filter((h) => !h.closed);
  const [holdingId, setHoldingId] = useState(() => guessHolding(text, active)?.id ?? active[0]?.id ?? '');
  const [form, setForm] = useState({ amount: amount ?? '', date: date ?? todayString() });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(form.amount);
    if (!(value > 0)) return setError('Enter an amount greater than zero.');
    const holding = active.find((h) => h.id === holdingId);
    if (!holding) return setError('Choose where the money went.');
    try {
      await onSave(holding, { holdingId, kind: 'invest', date: form.date, amount: value, note: text || '' });
      onClose();
    } catch {
      setError('Couldn’t save. Try again.');
    }
  };

  return (
    <Modal title="Log an investment" onClose={onClose} initialFocusRef={selectRef}>
      <form className="edit-form" onSubmit={submit} noValidate>
        {text && <p className="edit-original">You typed: <q>{text}</q></p>}
        {active.length > 0 ? (
          <>
            <div className="form-group">
              <label htmlFor={`${ids}-holding`}>Into</label>
              <select id={`${ids}-holding`} ref={selectRef} value={holdingId} onChange={(e) => setHoldingId(e.target.value)}>
                {active.map((h) => (
                  <option key={h.id} value={h.id}>
                    {typeInfo(h.type).emoji} {h.name}{h.platform ? ` · ${h.platform}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor={`${ids}-amount`}>Amount ({currency})</label>
                <input id={`${ids}-amount`} type="number" inputMode="decimal" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor={`${ids}-date`}>Date</label>
                <input id={`${ids}-date`} type="date" max={todayString()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <button type="button" className="btn-link" onClick={() => { onClose(); onNewHolding(); }}>
              It’s a new investment →
            </button>
          </>
        ) : (
          <p>
            You haven’t added any investments yet. Add this one — {formatAmount(Number(form.amount) || 0, currency)} — and it’ll
            be the first.
          </p>
        )}

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <div className="modal-actions-group">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            {active.length > 0 ? (
              <button type="submit" className="btn-accent">Log it</button>
            ) : (
              <button type="button" className="btn-accent" onClick={() => { onClose(); onNewHolding(); }}>Add investment</button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default QuickInvestModal;
