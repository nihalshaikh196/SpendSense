import { useState, useEffect, useRef, useMemo } from 'react';
import { Chart, ArcElement, DoughnutController, BarElement, BarController, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { getStats } from '../lib/store.js';
import { formatAmount } from '../lib/currency.js';
import { getCategoryLabel } from '../lib/categories.js';
import './DashboardPage.css';

Chart.register(ArcElement, DoughnutController, BarElement, BarController, CategoryScale, LinearScale, Tooltip, Legend);

// Match with CSS variables
const CATEGORY_COLORS = {
  food: '#ff6b6b',
  transport: '#4ecdc4',
  shopping: '#ffd93d',
  entertainment: '#ff8a5c',
  health: '#6bcb77',
  bills: '#4d96ff',
  education: '#845ec2',
  personal: '#ff6f91',
  other: '#8b8d9e'
};

function DashboardPage() {
  const { expenses, loading } = useExpenses();
  const { currency } = useSettings();
  
  const [stats, setStats] = useState({
    today: { total: 0, count: 0 },
    week: { total: 0, count: 0 },
    month: { total: 0, count: 0, byCategory: {} }
  });

  const donutRef = useRef(null);
  const barRef = useRef(null);
  const donutChartInstance = useRef(null);
  const barChartInstance = useRef(null);

  // Load stats
  useEffect(() => {
    async function loadStats() {
      try {
        const [today, week, month] = await Promise.all([
          getStats('today'),
          getStats('week'),
          getStats('month')
        ]);
        setStats({ today, week, month });
      } catch (err) {
        console.error('Failed to load stats', err);
      }
    }
    loadStats();
  }, [expenses]);

  // People spending calculation
  const peopleSpending = useMemo(() => {
    const totals = {};
    expenses.forEach(exp => {
      if (exp.people && exp.people.length > 0) {
        // Split amount evenly among people (plus user)
        const splitAmount = exp.amount / (exp.people.length + 1);
        exp.people.forEach(person => {
          totals[person] = (totals[person] || 0) + splitAmount;
        });
      }
    });

    return Object.entries(totals)
      .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  // Render Charts
  useEffect(() => {
    if (loading) return;

    // Destroy existing charts
    if (donutChartInstance.current) donutChartInstance.current.destroy();
    if (barChartInstance.current) barChartInstance.current.destroy();

    // -- Donut Chart (Categories) --
    if (donutRef.current && Object.keys(stats.month.byCategory).length > 0) {
      const categories = Object.keys(stats.month.byCategory);
      const data = categories.map(c => stats.month.byCategory[c]);
      const bgColors = categories.map(c => CATEGORY_COLORS[c] || CATEGORY_COLORS.other);
      const labels = categories.map(c => getCategoryLabel(c));

      donutChartInstance.current = new Chart(donutRef.current, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: bgColors,
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(10, 11, 20, 0.9)',
              titleColor: '#8b8d9e',
              bodyColor: '#f0f0f5',
              padding: 12,
              borderColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              callbacks: {
                label: (context) => ` ${formatAmount(context.raw, currency)}`
              }
            }
          }
        }
      });
    }

    // -- Bar Chart (Daily Trend) --
    if (barRef.current && expenses.length > 0) {
      // Group by date for current month
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // Get all days in month up to today
      const daysInMonth = today.getDate();
      const dailyTotals = Array(daysInMonth).fill(0);
      const labels = Array(daysInMonth).fill('').map((_, i) => `${i + 1}`);

      expenses.forEach(exp => {
        const d = new Date(exp.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          const dayIdx = d.getDate() - 1;
          if (dayIdx >= 0 && dayIdx < daysInMonth) {
            dailyTotals[dayIdx] += exp.amount;
          }
        }
      });

      barChartInstance.current = new Chart(barRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Daily Spend',
            data: dailyTotals,
            backgroundColor: 'rgba(124, 92, 252, 0.6)',
            hoverBackgroundColor: 'rgba(192, 132, 252, 0.8)',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(10, 11, 20, 0.9)',
              callbacks: {
                label: (context) => ` ${formatAmount(context.raw, currency)}`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#8b8d9e', maxTicksLimit: 10 }
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { display: false }
            }
          }
        }
      });
    }

    return () => {
      if (donutChartInstance.current) donutChartInstance.current.destroy();
      if (barChartInstance.current) barChartInstance.current.destroy();
    };
  }, [stats.month.byCategory, expenses, currency, loading]);

  if (loading) {
    return (
      <div className="dashboard-page page-container">
        <div className="empty-state">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page page-container">
      {/* ─── Summary Stats ─── */}
      <section className="summary-cards">
        <div className="glass-card summary-card" style={{ animationDelay: '0ms' }}>
          <span className="summary-label">Today</span>
          <span className="summary-value">{formatAmount(stats.today.total, currency)}</span>
          <span className="summary-count">{stats.today.count} expenses</span>
        </div>
        <div className="glass-card summary-card" style={{ animationDelay: '100ms' }}>
          <span className="summary-label">This Week</span>
          <span className="summary-value">{formatAmount(stats.week.total, currency)}</span>
          <span className="summary-count">{stats.week.count} expenses</span>
        </div>
        <div className="glass-card summary-card" style={{ animationDelay: '200ms' }}>
          <span className="summary-label">This Month</span>
          <span className="summary-value">{formatAmount(stats.month.total, currency)}</span>
          <span className="summary-count">{stats.month.count} expenses</span>
        </div>
      </section>

      {/* ─── Category Breakdown ─── */}
      <section className="chart-section" style={{ animationDelay: '300ms' }}>
        <div className="section-header">
          <h2>Spend by Category</h2>
        </div>
        <div className="glass-card chart-card">
          {Object.keys(stats.month.byCategory).length > 0 ? (
            <>
              <div className="chart-container">
                <canvas ref={donutRef}></canvas>
              </div>
              <div className="donut-legend">
                {Object.entries(stats.month.byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => (
                  <div key={cat} className="legend-item">
                    <span className="legend-color" style={{ background: CATEGORY_COLORS[cat] || CATEGORY_COLORS.other }}></span>
                    <span>{getCategoryLabel(cat)}</span>
                    <span className="legend-value">{formatAmount(amt, currency)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state-text">No expenses this month to show.</div>
          )}
        </div>
      </section>

      {/* ─── Daily Trend ─── */}
      <section className="chart-section" style={{ animationDelay: '400ms' }}>
        <div className="section-header">
          <h2>Daily Trend</h2>
        </div>
        <div className="glass-card chart-card">
          {expenses.length > 0 ? (
            <div className="chart-container">
              <canvas ref={barRef}></canvas>
            </div>
          ) : (
            <div className="empty-state-text">Not enough data to show trend.</div>
          )}
        </div>
      </section>

      {/* ─── People Spending ─── */}
      <section className="chart-section" style={{ animationDelay: '500ms' }}>
        <div className="section-header">
          <h2>Who you spend with</h2>
        </div>
        {peopleSpending.length > 0 ? (
          <div className="people-list">
            {peopleSpending.map((person, i) => (
              <div key={person.name} className="glass-card person-card" style={{ animationDelay: `${i * 50 + 500}ms` }}>
                <div className="person-info">
                  <div className="person-avatar">{person.name.charAt(0).toUpperCase()}</div>
                  <span className="person-name">{person.name}</span>
                </div>
                <div className="person-amount">
                  {formatAmount(person.amount, currency)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card chart-card" style={{ minHeight: 'auto', padding: 'var(--space-xl)' }}>
            <div className="empty-state-text">No shared expenses yet.</div>
          </div>
        )}
      </section>
    </div>
  );
}

export default DashboardPage;
