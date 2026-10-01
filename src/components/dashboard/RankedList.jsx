import { Link } from 'react-router-dom';

/**
 * Ranked horizontal bars built from plain HTML. Replaces the category donut:
 * lengths compare more accurately than angles, the rows sort naturally, and
 * every row is a real link (drill-down) that a keyboard and a screen reader
 * can reach. Each row reads in full without the bar, so the bar is decoration
 * for sighted users rather than the only carrier of the number.
 *
 * @param {Object} props
 * @param {Array<{ key: string, label: React.ReactNode, value: string, amount: number, meta?: React.ReactNode, to?: string }>} props.rows
 * @param {string} props.ariaLabel
 */
function RankedList({ rows, ariaLabel }) {
  const max = Math.max(...rows.map((r) => r.amount), 0);

  return (
    <ol className="ranked-list" aria-label={ariaLabel}>
      {rows.map((row) => {
        const width = max > 0 ? Math.max((row.amount / max) * 100, 1.5) : 0;
        const body = (
          <>
            <span className="ranked-head">
              <span className="ranked-label">{row.label}</span>
              <span className="ranked-value">{row.value}</span>
            </span>
            <span className="ranked-track" aria-hidden="true">
              <span className="ranked-bar" style={{ width: `${width}%` }} />
            </span>
            {row.meta && <span className="ranked-meta">{row.meta}</span>}
          </>
        );
        return (
          <li key={row.key}>
            {row.to ? (
              <Link className="ranked-row ranked-row-link" to={row.to}>
                {body}
              </Link>
            ) : (
              <div className="ranked-row">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default RankedList;
