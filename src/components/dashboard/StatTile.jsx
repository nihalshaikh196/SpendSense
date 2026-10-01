/**
 * Signed change against a named comparison. Spending going up is the bad
 * direction, so up reads as a warning and down as good — with an arrow and
 * words, never color alone.
 *
 * `compact` drops the visible "vs …" where a column header or card hint
 * already names the comparison; screen readers still hear it in full.
 */
export function Delta({ pct, against, compact = false }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return (
      <span className="delta delta-none" aria-label={`No spending in ${against} to compare`}>
        <span aria-hidden="true">{compact ? 'new' : `Nothing in ${against} to compare`}</span>
      </span>
    );
  }
  const rounded = Math.round(Math.abs(pct));
  if (rounded === 0) {
    return (
      <span className="delta delta-flat" aria-label={`About the same as ${against}`}>
        <span aria-hidden="true">{compact ? '≈ same' : `≈ same as ${against}`}</span>
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span
      className={`delta ${up ? 'delta-up' : 'delta-down'}`}
      aria-label={`${rounded}% ${up ? 'more' : 'less'} than ${against}`}
    >
      <span aria-hidden="true">
        {up ? '↑' : '↓'} {rounded}%{compact ? '' : ` vs ${against}`}
      </span>
    </span>
  );
}

function StatTile({ label, value, delta, sub, hero = false }) {
  return (
    <div className={`glass-card stat-tile ${hero ? 'stat-tile-hero' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {delta}
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export default StatTile;
