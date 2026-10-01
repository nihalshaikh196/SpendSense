import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
} from 'chart.js';
import { formatAmount, formatCompact } from '../../lib/currency.js';
import { SERIES } from './palette.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
);

/**
 * Draws labelled horizontal reference lines (average, budget) across the
 * plot. A dataset of repeated values would do it too, but would also show
 * up in the tooltip as if it were data.
 */
const referenceLinesPlugin = {
  id: 'referenceLines',
  afterDatasetsDraw(chart, _args, options) {
    const lines = options?.lines || [];
    if (lines.length === 0) return;
    const { ctx, chartArea, scales } = chart;

    ctx.save();
    for (const line of lines) {
      const y = scales.y.getPixelForValue(line.value);
      if (y < chartArea.top || y > chartArea.bottom) continue;

      ctx.strokeStyle = line.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();

      // The label sits on a plate of the card surface so it stays legible
      // where it crosses bars or lines.
      ctx.setLineDash([]);
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const padX = 5;
      const width = ctx.measureText(line.label).width + padX * 2;
      const height = 18;
      const x = line.align === 'left' ? chartArea.left + 4 : chartArea.right - width;
      const top = Math.max(chartArea.top, y - height - 3);
      ctx.fillStyle = SERIES.surface;
      ctx.beginPath();
      ctx.roundRect(x, top, width, height, 4);
      ctx.fill();
      ctx.fillStyle = SERIES.textSecondary;
      ctx.fillText(line.label, x + padX, top + height / 2);
    }
    ctx.restore();
  },
};

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Spending over time for one period.
 *
 * @param {Object}   props
 * @param {string[]} props.labels     - Axis labels, one per point
 * @param {string[]} props.titles     - Tooltip titles, one per point
 * @param {Array<{ label: string, data: Array<number|null>, kind: 'bar'|'line'|'area'|'context'|'projection' }>} props.series
 * @param {Array<{ value: number, label: string, color: string, align?: 'left'|'right' }>} [props.referenceLines]
 *   Label sits at the end of the line where the data isn't: right for a
 *   daily chart (future days are empty), left for a running total (it
 *   starts low and climbs).
 * @param {string}   props.currency
 * @param {string}   props.ariaLabel  - One-sentence summary for screen readers
 * @param {(index: number) => void} [props.onSelect] - Drill-down on click
 */
function TrendChart({ labels, titles, series, referenceLines = [], currency, ariaLabel, onSelect }) {
  const canvasRef = useRef(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    const datasets = series.map((s, i) => {
      if (s.kind === 'bar') {
        return {
          type: 'bar',
          label: s.label,
          data: s.data,
          backgroundColor: SERIES.primary,
          hoverBackgroundColor: SERIES.primaryHover,
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 24,
          categoryPercentage: 0.85,
          barPercentage: 0.9,
          order: 2,
        };
      }
      const base = {
        type: 'line',
        label: s.label,
        data: s.data,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 12,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        tension: 0.25,
        order: 1,
      };
      if (s.kind === 'area') {
        return {
          ...base,
          borderColor: SERIES.primary,
          pointHoverBackgroundColor: SERIES.primary,
          backgroundColor: SERIES.primaryWash,
          fill: 'origin',
          order: 0,
        };
      }
      if (s.kind === 'context') {
        return { ...base, borderColor: SERIES.context, pointHoverBackgroundColor: SERIES.context, order: 3 + i };
      }
      if (s.kind === 'projection') {
        return {
          ...base,
          borderColor: SERIES.primary,
          borderDash: [2, 4],
          pointHoverBackgroundColor: SERIES.primary,
          spanGaps: true,
          tension: 0,
        };
      }
      return { ...base, borderColor: SERIES.secondary, pointHoverBackgroundColor: SERIES.secondary };
    });

    const peak = Math.max(
      0,
      ...series.flatMap((s) => s.data.filter((v) => v !== null)),
      ...referenceLines.map((l) => l.value),
    );

    const chart = new Chart(canvasRef.current, {
      data: { labels, datasets },
      plugins: [referenceLinesPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reduceMotion() ? false : { duration: 350 },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8 } },
        onClick: (event, _elements, c) => {
          const hit = c.getElementsAtEventForMode(event, 'index', { intersect: false }, false);
          if (hit.length && onSelectRef.current) onSelectRef.current(hit[0].index);
        },
        onHover: (event, _elements, c) => {
          const hit = c.getElementsAtEventForMode(event, 'index', { intersect: false }, false);
          c.canvas.style.cursor = hit.length && onSelectRef.current ? 'pointer' : 'default';
        },
        plugins: {
          legend: { display: false },
          referenceLines: { lines: referenceLines },
          tooltip: {
            backgroundColor: 'rgba(10, 11, 20, 0.95)',
            titleColor: SERIES.textSecondary,
            bodyColor: SERIES.textPrimary,
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12,
            boxWidth: 10,
            boxHeight: 2,
            boxPadding: 6,
            usePointStyle: false,
            filter: (item) => item.raw !== null && item.raw !== undefined,
            callbacks: {
              title: (items) => titles[items[0].dataIndex],
              label: (item) => ` ${formatAmount(item.raw, currency)}  ${item.dataset.label}`,
              labelColor: (item) => {
                const color = item.dataset.borderColor || item.dataset.backgroundColor;
                return { borderColor: color, backgroundColor: color };
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: SERIES.axis },
            ticks: { color: SERIES.textMuted, maxRotation: 0, autoSkipPadding: 12, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            suggestedMax: peak * 1.08,
            border: { display: false },
            grid: { color: SERIES.grid, drawTicks: false },
            ticks: {
              color: SERIES.textMuted,
              padding: 8,
              maxTicksLimit: 5,
              font: { size: 11 },
              callback: (value) => formatCompact(value, currency),
            },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [labels, titles, series, referenceLines, currency]);

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}

export default TrendChart;
