import { useId, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import { CURRENCIES } from '../../lib/currency.js';
import { addDays, todayString } from '../../lib/analytics.js';
import { ASSET_CLASSES, COMPOUNDING, INVESTMENT_TYPES, typeInfo } from '../../lib/investments.js';

const NEW_GOAL = '__new';

const num = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

function addYears(date, years) {
  const [y, m, d] = date.split('-').map(Number);
  return addDays(`${y + years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 0);
}

/**
 * Add or edit a holding. Adding also takes the money already in, so an
 * investment held for years can be entered in one step ("1,00,000 since Jan
 * 2024, worth 1,30,000 now") without its full history.
 */
function HoldingForm({ holding, goals, platforms, defaultCurrency, initialAmount, initialDate, onSave, onDelete, onClose }) {
  const ids = useId();
  const nameRef = useRef(null);
  const today = todayString();
  const isNew = !holding;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    name: holding?.name ?? '',
    type: holding?.type ?? 'equityMf',
    platform: holding?.platform ?? '',
    currency: holding?.currency ?? defaultCurrency,
    goalId: holding?.goalId ?? '',
    newGoal: '',
    rate: holding?.rate ?? '',
    compounding: holding?.compounding ?? '',
    maturityDate: holding?.maturityDate ?? '',
    lockInUntil: holding?.lockInUntil ?? '',
    sip: Boolean(holding?.sipAmount),
    sipAmount: holding?.sipAmount ?? '',
    sipDay: holding?.sipDay ?? '',
    notes: holding?.notes ?? '',
    amount: initialAmount ?? '',
    date: initialDate ?? today,
    units: '',
    currentValue: '',
  }));

  const info = typeInfo(form.type);
  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Picking a type with a standard lock-in pre-fills it; still editable.
  const setType = (e) => {
    const type = e.target.value;
    const years = typeInfo(type).lockInYears;
    setForm((prev) => ({
      ...prev,
      type,
      lockInUntil: !prev.lockInUntil && years ? addYears(prev.date || today, years) : prev.lockInUntil,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const amount = num(form.amount);
    const rate = num(form.rate);
    const sipAmount = num(form.sipAmount);
    const sipDay = num(form.sipDay);

    if (!form.name.trim()) return fail('Give it a name — e.g. “Parag Parikh Flexi Cap” or “SBI FD”.', nameRef);
    if (isNew && amount !== null && !(amount >= 0)) return fail('The amount invested can’t be negative.');
    if (isNew && amount && !form.date) return fail('Choose when you first invested.');
    if (rate !== null && !(rate >= 0 && rate <= 100)) return fail('Interest rate should be between 0 and 100%.');
    if (form.sip && !(sipAmount > 0)) return fail('Enter the monthly SIP amount.');
    if (form.sip && !(Number.isInteger(sipDay) && sipDay >= 1 && sipDay <= 31)) return fail('SIP day should be 1–31.');
    if (form.goalId === NEW_GOAL && !form.newGoal.trim()) return fail('Name the new goal.');

    const next = {
      ...(holding ?? {}),
      name: form.name.trim(),
      type: form.type,
      platform: form.platform.trim(),
      currency: form.currency,
      goalId: form.goalId && form.goalId !== NEW_GOAL ? form.goalId : null,
      notes: form.notes.trim(),
      rate: info.rate ? rate : null,
      compounding: info.rate ? num(form.compounding) || info.compounding : null,
      maturityDate: form.maturityDate || null,
      lockInUntil: form.lockInUntil || null,
      sipAmount: form.sip ? sipAmount : null,
      sipDay: form.sip ? sipDay : null,
    };

    setSaving(true);
    try {
      await onSave({
        holding: next,
        newGoalName: form.goalId === NEW_GOAL ? form.newGoal.trim() : null,
        initial: isNew && amount > 0
          ? { amount, date: form.date, units: num(form.units), currentValue: info.rate ? null : num(form.currentValue) }
          : null,
      });
      onClose();
    } catch {
      setError('Couldn’t save. Try again.');
      setSaving(false);
    }
  };

  function fail(message, ref) {
    setError(message);
    ref?.current?.focus();
  }

  const groups = Object.entries(ASSET_CLASSES).map(([key, label]) => ({
    label,
    types: Object.entries(INVESTMENT_TYPES).filter(([, t]) => t.assetClass === key),
  })).filter((g) => g.types.length);

  return (
    <Modal title={isNew ? 'Add investment' : 'Edit investment'} onClose={onClose} initialFocusRef={nameRef} className="modal-wide">
      <form className="edit-form" onSubmit={submit} noValidate>
        <div className="form-group">
          <label htmlFor={`${ids}-name`}>Name</label>
          <input
            id={`${ids}-name`}
            ref={nameRef}
            type="text"
            maxLength={120}
            placeholder="e.g. Nifty 50 index fund, SBI FD, PPF"
            value={form.name}
            onChange={set('name')}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor={`${ids}-type`}>Type</label>
            <select id={`${ids}-type`} value={form.type} onChange={setType}>
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.types.map(([key, t]) => (
                    <option key={key} value={key}>{t.emoji} {t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={`${ids}-platform`}>Platform / bank</label>
            <input
              id={`${ids}-platform`}
              type="text"
              list={`${ids}-platforms`}
              maxLength={80}
              placeholder="Zerodha, Groww, SBI…"
              value={form.platform}
              onChange={set('platform')}
            />
            <datalist id={`${ids}-platforms`}>
              {platforms.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
        </div>

        {isNew && (
          <fieldset className="form-section">
            <legend>Money in so far</legend>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor={`${ids}-amount`}>Amount invested</label>
                <input id={`${ids}-amount`} type="number" inputMode="decimal" min="0" step="any" placeholder="Leave empty if not yet" value={form.amount} onChange={set('amount')} />
              </div>
              <div className="form-group">
                <label htmlFor={`${ids}-date`}>Since</label>
                <input id={`${ids}-date`} type="date" max={today} value={form.date} onChange={set('date')} />
              </div>
            </div>
            {info.units && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor={`${ids}-units`}>Units (optional)</label>
                  <input id={`${ids}-units`} type="number" inputMode="decimal" min="0" step="any" placeholder="e.g. 152.38" value={form.units} onChange={set('units')} />
                </div>
                <div className="form-group">
                  <label htmlFor={`${ids}-value`}>Worth today (optional)</label>
                  <input id={`${ids}-value`} type="number" inputMode="decimal" min="0" step="any" placeholder="Current value" value={form.currentValue} onChange={set('currentValue')} />
                </div>
              </div>
            )}
            {!info.units && !info.rate && (
              <div className="form-group">
                <label htmlFor={`${ids}-value`}>Worth today (optional)</label>
                <input id={`${ids}-value`} type="number" inputMode="decimal" min="0" step="any" placeholder="Current value" value={form.currentValue} onChange={set('currentValue')} />
              </div>
            )}
            <p className="form-hint">
              Invested in several goes? One total with your first date is fine — returns will be approximate.
              You can add each installment later instead.
            </p>
          </fieldset>
        )}

        {info.rate && (
          <fieldset className="form-section">
            <legend>Interest</legend>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor={`${ids}-rate`}>Rate (% a year)</label>
                <input id={`${ids}-rate`} type="number" inputMode="decimal" min="0" max="100" step="any" placeholder="e.g. 7.1" value={form.rate} onChange={set('rate')} />
              </div>
              <div className="form-group">
                <label htmlFor={`${ids}-comp`}>Compounded</label>
                <select id={`${ids}-comp`} value={form.compounding || info.compounding} onChange={set('compounding')}>
                  {Object.entries(COMPOUNDING).map(([n, label]) => <option key={n} value={n}>{label}</option>)}
                </select>
              </div>
            </div>
            <p className="form-hint">The value is worked out from the rate, so you never need to update it by hand.</p>
          </fieldset>
        )}

        <div className="form-row">
          <div className="form-group">
            <label htmlFor={`${ids}-maturity`}>Maturity date</label>
            <input id={`${ids}-maturity`} type="date" value={form.maturityDate} onChange={set('maturityDate')} />
          </div>
          <div className="form-group">
            <label htmlFor={`${ids}-lock`}>Locked in until</label>
            <input id={`${ids}-lock`} type="date" value={form.lockInUntil} onChange={set('lockInUntil')} />
          </div>
        </div>

        <fieldset className="form-section">
          <legend>
            <label className="checkbox">
              <input type="checkbox" checked={form.sip} onChange={set('sip')} />
              Monthly SIP / recurring deposit
            </label>
          </legend>
          {form.sip && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor={`${ids}-sip`}>Amount each month</label>
                <input id={`${ids}-sip`} type="number" inputMode="decimal" min="0" step="any" value={form.sipAmount} onChange={set('sipAmount')} />
              </div>
              <div className="form-group">
                <label htmlFor={`${ids}-sipday`}>On day</label>
                <input id={`${ids}-sipday`} type="number" inputMode="numeric" min="1" max="31" step="1" placeholder="1–31" value={form.sipDay} onChange={set('sipDay')} />
              </div>
            </div>
          )}
        </fieldset>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor={`${ids}-goal`}>Goal</label>
            <select id={`${ids}-goal`} value={form.goalId} onChange={set('goalId')}>
              <option value="">No goal</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value={NEW_GOAL}>+ New goal…</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={`${ids}-currency`}>Currency</label>
            <select id={`${ids}-currency`} value={form.currency} onChange={set('currency')}>
              {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
            </select>
          </div>
        </div>
        {form.goalId === NEW_GOAL && (
          <div className="form-group">
            <label htmlFor={`${ids}-newgoal`}>New goal name</label>
            <input id={`${ids}-newgoal`} type="text" maxLength={80} placeholder="e.g. Retirement, House, Emergency fund" value={form.newGoal} onChange={set('newGoal')} />
          </div>
        )}

        <div className="form-group">
          <label htmlFor={`${ids}-notes`}>Notes</label>
          <textarea id={`${ids}-notes`} rows={2} maxLength={1000} placeholder="Folio number, nominee, account…" value={form.notes} onChange={set('notes')} />
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
            <button type="submit" className="btn-accent" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default HoldingForm;
