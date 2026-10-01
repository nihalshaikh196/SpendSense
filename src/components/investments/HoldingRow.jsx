import { Link } from 'react-router-dom';
import { formatAmount } from '../../lib/currency.js';
import Gain from './Gain.jsx';

/** One holding in the list: what it is, what it's worth, how it's done. */
function HoldingRow({ summary, goalName }) {
  const { holding: h, info } = summary;
  const meta = [info.label, h.platform, goalName].filter(Boolean).join(' · ');

  const badges = [];
  if (summary.sip) badges.push({ key: 'sip', label: `SIP ${formatAmount(h.sipAmount, summary.currency)}` });
  if (summary.matured) badges.push({ key: 'matured', label: 'Matured', tone: 'warn' });
  else if (summary.locked) badges.push({ key: 'locked', label: 'Locked in' });
  if (summary.needsValue) badges.push({ key: 'value', label: summary.valueSource === 'cost' ? 'No value yet' : 'Value is old', tone: 'warn' });

  return (
    <Link to={`/investments/${h.id}`} className="glass-card holding-row">
      <span className="holding-emoji" aria-hidden="true">{info.emoji}</span>
      <span className="holding-main">
        <span className="holding-name">{h.name}</span>
        <span className="holding-meta">{meta}</span>
        {badges.length > 0 && (
          <span className="holding-badges">
            {badges.map((b) => (
              <span key={b.key} className={`badge ${b.tone === 'warn' ? 'badge-warn' : ''}`}>{b.label}</span>
            ))}
          </span>
        )}
      </span>
      <span className="holding-figures">
        <span className="holding-value">{formatAmount(Math.round(summary.value), summary.currency)}</span>
        {h.closed ? (
          <Gain amount={summary.gain} pct={summary.gainPct} currency={summary.currency} />
        ) : summary.valueSource === 'cost' ? (
          <span className="holding-cost">at cost</span>
        ) : (
          <Gain amount={summary.gain} pct={summary.gainPct} currency={summary.currency} />
        )}
      </span>
    </Link>
  );
}

export default HoldingRow;
