import { useId, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import { formatAmount } from '../../lib/currency.js';
import { todayString } from '../../lib/analytics.js';
import { TXN_KINDS } from '../../lib/investments.js';

/** Picker labels are actions; TXN_KINDS (past tense) labels the history. */
const KIND_ACTIONS = { invest: 'Invest', withdraw: 'Withdraw', income: 'Income', value: 'Value' };

const KIND_HELP = {
  invest: 'Money you put in — a SIP installment, a top-up, a deposit.',
  withdraw: 'Money you took out — a redemption, a sale, a maturity payout.',
  income: 'Dividends or interest paid out to your bank. Reinvested dividends aren’t income — they show up in the value.',
  value: 'What it’s worth on this date, from your app or statement.',
};

const num = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

/**
 * Add or edit one entry in a holding's history. A value update can be typed
 * as a total or, when units are tracked, as today's price per unit.
 */
function TransactionForm({ summary, txn, defaultKind = 'invest', defaultAmount, defaultClose = false, onSave, onDelete, onClose }) {
  const ids = useId();
  const amountRef = useRef(null);
  const today = todayString();
  const { holding, currency } = summary;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    kind: txn?.kind ?? defaultKind,
    date: txn?.date ?? today,
    amount: txn?.amount ?? defaultAmount ?? '',
    units: txn?.units ?? '',
    price: '',
    note: txn?.note ?? '',
    close: defaultClose,
  }));

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const tracksUnits = summary.units !== null || summary.info.units;

  // Price × units on hand fills in the total for a value update.
  const setPrice = (e) => {
    const price = e.target.value;
    setForm((prev) => ({
      ...prev,
      price,
      amount: price !== '' && summary.units ? String(Math.round(Number(price) * summary.units * 100) / 100) : prev.amount,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const amount = num(form.amount);
    const units = num(form.units);
    if (!(amount >= 0) || (form.kind !== 'value' && !(amount > 0))) {
      setError(form.kind === 'value' ? 'Enter what it’s worth.' : 'Enter an amount greater than zero.');
      amountRef.current?.focus();
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Choose a date.');
      return;
    }
    if (units !== null && !(units >= 0)) {
      setError('Units can’t be negative.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        txn: {
          ...(txn ?? {}),
          holdingId: holding.id,
          kind: form.kind,
          date: form.date,
          amount: Math.round(amount * 100) / 100,
          units: (form.kind === 'invest' || form.kind === 'withdraw') && units ? units : null,
          note: form.note.trim(),
        },
        close: form.kind === 'withdraw' && form.close,
      });
      onClose();
    } catch {
      setError('Couldn’t save. Try again.');
      setSaving(false);
    }
  };

  const title = txn ? 'Edit entry' : holding.name;

  return (
    <Modal title={title} onClose={onClose} initialFocusRef={amountRef}>
      <form className="edit-form" onSubmit={submit} noValidate>
        <div className="segmented kind-picker" role="group" aria-label="Entry type">
          {Object.keys(TXN_KINDS).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={form.kind === kind}
              onClick={() => setForm((prev) => ({ ...prev, kind }))}
            >
              {KIND_ACTIONS[kind]}
            </button>
          ))}
        </div>
        <p className="form-hint">{KIND_HELP[form.kind]}</p>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor={`${ids}-amount`}>{form.kind === 'value' ? `Total value (${currency})` : `Amount (${currency})`}</label>
            <input
              id={`${ids}-amount`}
              ref={amountRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.amount}
              onChange={set('amount')}
            />
          </div>
          <div className="form-group">
            <label htmlFor={`${ids}-date`}>Date</label>
            <input id={`${ids}-date`} type="date" max={today} value={form.date} onChange={set('date')} />
          </div>
        </div>

        {tracksUnits && (form.kind === 'invest' || form.kind === 'withdraw') && (
          <div className="form-group">
            <label htmlFor={`${ids}-units`}>Units {form.kind === 'invest' ? 'bought' : 'sold'} (optional)</label>
            <input id={`${ids}-units`} type="number" inputMode="decimal" min="0" step="any" value={form.units} onChange={set('units')} />
          </div>
        )}

        {form.kind === 'value' && summary.units > 0 && (
          <div className="form-group">
            <label htmlFor={`${ids}-price`}>…or price per unit today</label>
            <input id={`${ids}-price`} type="number" inputMode="decimal" min="0" step="any" placeholder={`× ${summary.units} units`} value={form.price} onChange={setPrice} />
          </div>
        )}

        {form.kind === 'withdraw' && !holding.closed && (
          <label className="checkbox">
            <input type="checkbox" checked={form.close} onChange={set('close')} />
            Fully withdrawn — close this investment
            {summary.value > 0 && <span className="form-hint"> (worth {formatAmount(Math.round(summary.value), currency)})</span>}
          </label>
        )}

        <div className="form-group">
          <label htmlFor={`${ids}-note`}>Note (optional)</label>
          <input id={`${ids}-note`} type="text" maxLength={500} value={form.note} onChange={set('note')} />
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className={`modal-actions ${onDelete ? 'modal-actions-split' : ''}`}>
          {onDelete && (
            <button type="button" className="btn-link btn-link-danger" onClick={() => { onClose(); onDelete(); }}>
              Delete
            </button>
          )}
          <div className="modal-actions-group">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-accent" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default TransactionForm;
