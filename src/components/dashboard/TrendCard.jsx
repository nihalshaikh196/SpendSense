import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TrendChart from './TrendChart.jsx';
import { SERIES } from './palette.js';
import { formatAmount } from '../../lib/currency.js';

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented segmented-small" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function LegendKey({ kind }) {
  const color = kind === 'context' ? SERIES.context : kind === 'line' ? SERIES.secondary : SERIES.primary;
  if (kind === 'bar') return <span className="legend-key legend-key-bar" style={{ background: color }} />;
  if (kind === 'reference') return <span className="legend-key legend-key-dashed" />;
  if (kind === 'projection') return <span className="legend-key legend-key-dotted" style={{ color }} />;
  return <span className="legend-key legend-key-line" style={{ background: color }} />;
}

function TrendTable({ caption, columns, rows, currency, interactive = true }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c} scope="col" className={i > 0 ? 'num' : undefined}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                {interactive && row.to ? (
                  <Link to={row.to}>{row.title}</Link>
                ) : interactive && row.onSelect ? (
                  <button type="button" className="btn-link" onClick={row.onSelect}>{row.title}</button>
                ) : (
                  row.title
                )}
              </th>
              {row.values.map((v, i) => (
                <td key={i} className="num">{v === null || v === undefined ? '—' : formatAmount(v, currency)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Spending over time for the selected period, as a chart or a table.
 *
 * "Spending" shows each day (or month) with a smoothing line and the average
 * as a reference; "Running total" shows the period accumulating against the
 * previous one, the budget, and — for a period in progress — where it's
 * heading.
 */
function TrendCard({
  kind,
  points,
  rolling,
  previousValues,
  currentCumulative,
  previousCumulative,
  projected,
  budget,
  average,
  names,
  currency,
  onSelect,
}) {
  const [view, setView] = useState('spend');
  const [display, setDisplay] = useState('chart');

  const unit = kind === 'month' ? 'day' : 'month';
  const withSpend = points.filter((p) => p.spent > 0).length;
  const elapsed = points.filter((p) => p.spent !== null);

  const chart = useMemo(() => {
    const labels = points.map((p) => p.label);
    const titles = points.map((p) => p.title);

    if (view === 'spend') {
      const series = [{ label: 'Spent', data: points.map((p) => p.spent), kind: 'bar' }];
      if (kind === 'month') series.push({ label: '7-day average', data: rolling, kind: 'line' });
      else if (previousValues) series.push({ label: names.previous, data: previousValues, kind: 'context' });
      const referenceLines = average > 0
        ? [{ name: 'Average', value: average, label: `Avg ${formatAmount(Math.round(average), currency)}/${unit}`, color: SERIES.reference }]
        : [];
      return { labels, titles, series, referenceLines };
    }

    const series = [{ label: 'Spent so far', data: currentCumulative, kind: 'area' }];
    if (previousCumulative) {
      series.push({ label: `${names.previous} so far`, data: previousCumulative, kind: 'context' });
    }
    if (projected !== null) {
      const last = elapsed.length - 1;
      const data = points.map((_, i) => {
        if (i === last) return currentCumulative[last];
        if (i === points.length - 1) return projected;
        return null;
      });
      series.push({ label: 'Projected', data, kind: 'projection' });
    }
    // A year's budget is twelve monthly ones.
    const cap = budget ? (kind === 'month' ? budget : budget * 12) : 0;
    const referenceLines = cap
      ? [{ name: 'Budget', value: cap, label: `Budget ${formatAmount(cap, currency)}`, color: SERIES.reference, align: 'left' }]
      : [];
    return { labels, titles, series, referenceLines };
  }, [view, points, rolling, previousValues, currentCumulative, previousCumulative, projected, budget, average, names, currency, kind, unit, elapsed.length]);

  const legend = [
    ...chart.series.map((s) => ({ label: s.label, kind: s.kind })),
    ...chart.referenceLines.map((l) => ({ label: l.name, kind: 'reference' })),
  ];

  // Same numbers as the chart; a comparison column only when there is one.
  const extra = view === 'spend'
    ? (kind === 'month' ? { name: '7-day average', data: rolling } : previousValues && { name: names.previous, data: previousValues })
    : previousCumulative && { name: `${names.previous} so far`, data: previousCumulative };
  const table = {
    columns: [kind === 'month' ? 'Date' : 'Month', view === 'spend' ? 'Spent' : 'Spent so far', ...(extra ? [extra.name] : [])],
    rows: elapsed.map((p, i) => ({
      key: p.key,
      title: p.title,
      to: p.to,
      // Elapsed points are a prefix of all points, so indices line up.
      onSelect: p.to || !onSelect ? undefined : () => onSelect(i),
      values: [view === 'spend' ? p.spent : currentCumulative[i], ...(extra ? [extra.data[i]] : [])],
    })),
  };

  const peak = elapsed.reduce((best, p) => (p.spent > (best?.spent ?? 0) ? p : best), null);
  const total = currentCumulative[elapsed.length - 1] ?? 0;
  const ariaLabel = view === 'spend'
    ? `${kind === 'month' ? 'Daily' : 'Monthly'} spending for ${names.current}: ${formatAmount(total, currency)} over ${elapsed.length} ${unit}s` +
      (peak ? `, highest ${formatAmount(peak.spent, currency)} on ${peak.title}.` : '.')
    : `Running total for ${names.current}: ${formatAmount(total, currency)} so far` +
      (projected !== null ? `, projected ${formatAmount(projected, currency)}.` : '.');

  return (
    <section className="dash-card dash-trend" aria-labelledby="trend-title">
      <div className="card-header">
        <h2 id="trend-title">{kind === 'month' ? 'Daily spending' : 'Monthly spending'}</h2>
        <div className="card-controls">
          <Segmented
            label="Trend view"
            value={view}
            onChange={setView}
            options={[
              { value: 'spend', label: kind === 'month' ? 'Daily' : 'Monthly' },
              { value: 'cumulative', label: 'Running total' },
            ]}
          />
          <Segmented
            label="Show as"
            value={display}
            onChange={setDisplay}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>
      </div>

      {withSpend < 2 ? (
        <div className="sparse-state">
          <p>
            {withSpend === 0
              ? `Nothing logged in ${names.current} yet.`
              : `Only one ${unit} with spending so far.`}{' '}
            The trend appears once there are two or more {unit}s to compare.
          </p>
          <Link to="/" className="btn-secondary">Add an expense</Link>
        </div>
      ) : display === 'chart' ? (
        <>
          <ul className="chart-legend" aria-label="Legend">
            {legend.map((item) => (
              <li key={item.label}>
                <LegendKey kind={item.kind} />
                {item.label}
              </li>
            ))}
          </ul>
          <TrendChart
            labels={chart.labels}
            titles={chart.titles}
            series={chart.series}
            referenceLines={chart.referenceLines}
            currency={currency}
            ariaLabel={ariaLabel}
            onSelect={onSelect}
          />
          <div className="sr-only">
            <TrendTable
              caption={ariaLabel}
              columns={table.columns}
              rows={table.rows}
              currency={currency}
              interactive={false}
            />
          </div>
          <p className="card-footnote">
            {kind === 'month' ? 'Select a day to see its expenses.' : 'Select a month to open its report.'}
          </p>
        </>
      ) : (
        <TrendTable caption={ariaLabel} columns={table.columns} rows={table.rows} currency={currency} />
      )}
    </section>
  );
}

export default TrendCard;
