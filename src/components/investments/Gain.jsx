import { formatAmount } from '../../lib/currency.js';

/**
 * Gain or loss with its sign spelled out. For investments up is good — the
 * opposite of spending — so gains wear the good status color and losses the
 * critical one, always with an arrow and a sign so color is never the only
 * cue.
 */
function Gain({ amount, pct, currency, showAmount = true, className = '' }) {
  if (amount === null || amount === undefined) return null;
  const rounded = Math.round(amount);
  const tone = rounded > 0 ? 'gain-up' : rounded < 0 ? 'gain-down' : 'gain-flat';
  const arrow = rounded > 0 ? '▲' : rounded < 0 ? '▼' : '';
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  const pctText = pct === null || pct === undefined ? '' : `${sign}${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;

  return (
    <span className={`gain ${tone} ${className}`}>
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {showAmount && `${sign}${formatAmount(Math.abs(rounded), currency)}`}
      {showAmount && pctText && ' '}
      {pctText && (showAmount ? `(${pctText})` : pctText)}
    </span>
  );
}

export default Gain;
