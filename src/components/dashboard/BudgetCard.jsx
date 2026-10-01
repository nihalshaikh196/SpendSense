import { useId, useState } from 'react';
import { formatAmount, getCurrencySymbol } from '../../lib/currency.js';

/**
 * Monthly budget: a meter of spend against the cap, the projected month-end
 * total, and a plain-language status. Status is carried by icon + words;
 * the meter color only repeats it.
 */
function BudgetCard({ currency, budget, spent, projected, inProgress, daysLeft, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const inputId = useId();

  const startEditing = () => {
    setDraft(budget ? String(budget) : '');
    setError('');
    setEditing(true);
  };

  const save = (e) => {
    e.preventDefault();
    const value = parseFloat(draft);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    onSave(Math.round(value * 100) / 100);
    setEditing(false);
  };

  const remove = () => {
    onSave(0);
    setEditing(false);
  };

  if (editing || !budget) {
    return (
      <form className="budget-form" onSubmit={save} noValidate>
        {!budget && !editing && (
          <p className="card-note">
            Set a monthly budget to see how your pace compares and where the month is heading.
          </p>
        )}
        <label htmlFor={inputId} className="budget-form-label">
          Monthly budget ({currency})
        </label>
        <div className="budget-form-row">
          <span className="budget-form-symbol" aria-hidden="true">{getCurrencySymbol(currency)}</span>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min="1"
            step="any"
            placeholder="e.g. 20000"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
          />
          <button type="submit" className="btn-accent btn-compact">Save</button>
        </div>
        {error && <span id={`${inputId}-error`} className="form-error">{error}</span>}
        {editing && (
          <div className="budget-form-actions">
            <button type="button" className="btn-link" onClick={() => setEditing(false)}>Cancel</button>
            {budget > 0 && (
              <button type="button" className="btn-link btn-link-danger" onClick={remove}>Remove budget</button>
            )}
          </div>
        )}
        <span className="card-footnote">Saved on this device only.</span>
      </form>
    );
  }

  const used = spent / budget;
  const remaining = budget - spent;
  let status;
  if (remaining < 0) {
    status = {
      tone: 'critical',
      icon: '✕',
      text: inProgress
        ? `Over budget by ${formatAmount(Math.round(-remaining), currency)}`
        : `Went ${formatAmount(Math.round(-remaining), currency)} over budget`,
    };
  } else if (inProgress && projected !== null && projected > budget) {
    status = {
      tone: 'warning',
      icon: '!',
      text: `On pace to overspend by ${formatAmount(Math.round(projected - budget), currency)}`,
    };
  } else {
    status = {
      tone: 'good',
      icon: '✓',
      text: inProgress
        ? `On track — ${formatAmount(Math.round(remaining), currency)} left`
        : `Came in ${formatAmount(Math.round(remaining), currency)} under budget`,
    };
  }

  const perDay = inProgress && remaining > 0 && daysLeft > 0 ? remaining / daysLeft : null;
  const projectedPos = projected !== null ? Math.min(projected / budget, 1) * 100 : null;

  return (
    <div className="budget-body">
      <div className="budget-figures">
        <span className="budget-spent">{formatAmount(spent, currency)}</span>
        <span className="budget-cap">of {formatAmount(budget, currency)}</span>
      </div>

      <div
        className={`meter meter-${status.tone}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(spent, budget)}
        aria-label={`Budget used: ${Math.round(used * 100)}%`}
      >
        <span className="meter-fill" style={{ width: `${Math.min(used, 1) * 100}%` }} />
        {inProgress && projectedPos !== null && (
          <span className="meter-marker" style={{ left: `${projectedPos}%` }} title="Projected month-end" />
        )}
      </div>

      <p className={`status status-${status.tone}`}>
        <span className="status-icon" aria-hidden="true">{status.icon}</span>
        {status.text}
      </p>

      <dl className="budget-details">
        <div>
          <dt>Used</dt>
          <dd>{Math.round(used * 100)}%</dd>
        </div>
        {inProgress && projected !== null && (
          <div>
            <dt>Projected</dt>
            <dd>{formatAmount(projected, currency)}</dd>
          </div>
        )}
        {perDay !== null && (
          <div>
            <dt>Per day to stay on budget</dt>
            <dd>{formatAmount(Math.floor(perDay), currency)}</dd>
          </div>
        )}
      </dl>

      <button type="button" className="btn-link" onClick={startEditing}>Change budget</button>
    </div>
  );
}

export default BudgetCard;
