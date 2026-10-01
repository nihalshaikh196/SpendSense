import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useInvestments } from '../context/InvestmentContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useInvestmentActions } from '../hooks/useInvestmentActions.js';
import { CURRENCIES, formatAmount } from '../lib/currency.js';
import { relativeDay, todayString } from '../lib/analytics.js';
import { downloadCsv } from '../lib/csv.js';
import {
  allocation,
  ASSET_CLASSES,
  attentionItems,
  COMMON_PLATFORMS,
  goalProgress,
  holdingsToCsv,
  summarizeHolding,
  summarizePortfolio,
  transactionsToCsv,
} from '../lib/investments.js';
import RankedList from '../components/dashboard/RankedList.jsx';
import Gain from '../components/investments/Gain.jsx';
import HoldingRow from '../components/investments/HoldingRow.jsx';
import HoldingForm from '../components/investments/HoldingForm.jsx';
import TransactionForm from '../components/investments/TransactionForm.jsx';
import GoalForm from '../components/investments/GoalForm.jsx';
import QuickInvestModal from '../components/investments/QuickInvestModal.jsx';
import '../styles/reports.css';
import './InvestmentsPage.css';

const SORTS = {
  value: { label: 'Value', compare: (a, b) => b.value - a.value },
  gain: { label: 'Return %', compare: (a, b) => (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity) },
  xirr: { label: 'XIRR', compare: (a, b) => (b.xirr ?? -Infinity) - (a.xirr ?? -Infinity) },
  name: { label: 'Name', compare: (a, b) => a.holding.name.localeCompare(b.holding.name) },
};

const ALLOCATION_VIEWS = { class: 'Asset class', platform: 'Platform', goal: 'Goal' };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function monthYear(date) {
  const [y, m] = date.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' });
}

/** "today", "yesterday", "on Mon, Oct 20" — reads inside a sentence. */
function dayPhrase(date, today) {
  const day = relativeDay(date, today);
  return day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : `on ${day}`;
}

/** What an attention item says and offers. */
function describeItem(item, today) {
  const s = item.summary;
  const h = s.holding;
  const money = (n) => formatAmount(Math.round(n), s.currency);
  switch (item.kind) {
    case 'sip-due':
      return {
        icon: '⏰',
        text: `${money(h.sipAmount)} SIP due ${s.sip.overdueDays ? `${s.sip.overdueDays} day${s.sip.overdueDays === 1 ? '' : 's'} ago` : 'today'}`,
        action: 'log-sip',
        actionLabel: 'Log SIP',
      };
    case 'sip-upcoming':
      return { icon: '🗓️', text: `${money(h.sipAmount)} SIP ${dayPhrase(item.date, today)}` };
    case 'matured':
      return { icon: '✅', text: `Matured ${dayPhrase(item.date, today)} · worth ${money(s.value)}`, action: 'payout', actionLabel: 'Record payout' };
    case 'maturing':
      return { icon: '⌛', text: `Matures ${dayPhrase(item.date, today)} · worth ${money(s.value)} now` };
    case 'unlocking':
      return { icon: '🔓', text: `Lock-in ends ${dayPhrase(item.date, today)}` };
    case 'update-value':
      return {
        icon: '✏️',
        text: s.valueSource === 'cost' ? 'No current value yet — returns show as zero' : `Value last updated ${s.staleDays} days ago`,
        action: 'value',
        actionLabel: 'Update value',
      };
    default:
      return { icon: '•', text: '' };
  }
}

function InvestmentsPage() {
  const { holdings, txns, goals, loading, syncError } = useInvestments();
  const { currency: preferredCurrency } = useSettings();
  const actions = useInvestmentActions();
  const location = useLocation();
  const navigate = useNavigate();
  const exportRef = useRef(null);
  const today = todayString();

  // Arriving from Home with "log this as an investment" opens the picker.
  const [modal, setModal] = useState(() => {
    const quick = location.state?.quickAdd;
    return quick ? { type: 'quick', ...quick } : null;
  });
  const [sort, setSort] = useState('value');
  const [view, setView] = useState('class');
  const [chosenCurrency, setChosenCurrency] = useState(null);

  useEffect(() => {
    if (location.state?.quickAdd) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const summaries = useMemo(() => {
    const byHolding = new Map();
    for (const t of txns) {
      if (!byHolding.has(t.holdingId)) byHolding.set(t.holdingId, []);
      byHolding.get(t.holdingId).push(t);
    }
    return holdings.map((h) => summarizeHolding(h, byHolding.get(h.id) ?? [], today));
  }, [holdings, txns, today]);

  const currencies = useMemo(() => [...new Set(summaries.map((s) => s.currency))], [summaries]);
  const currency = chosenCurrency && currencies.includes(chosenCurrency)
    ? chosenCurrency
    : currencies.includes(preferredCurrency) ? preferredCurrency : currencies[0] ?? preferredCurrency;

  const mine = useMemo(() => summaries.filter((s) => s.currency === currency), [summaries, currency]);
  const portfolio = useMemo(() => summarizePortfolio(summaries, currency, today), [summaries, currency, today]);
  const attention = useMemo(() => attentionItems(summaries, today), [summaries, today]);
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const progress = useMemo(() => goals.map((g) => goalProgress(g, mine, today)), [goals, mine, today]);
  const platforms = useMemo(
    () => [...new Set([...holdings.map((h) => h.platform).filter(Boolean), ...COMMON_PLATFORMS])],
    [holdings],
  );

  const allocationRows = useMemo(() => {
    const config = {
      class: [(s) => s.assetClass, (k) => ASSET_CLASSES[k]],
      platform: [(s) => s.holding.platform || '(no platform)', (k) => k],
      goal: [(s) => s.holding.goalId || '(none)', (k) => goalsById.get(k)?.name ?? 'No goal'],
    }[view];
    return allocation(mine, ...config);
  }, [mine, view, goalsById]);

  const active = mine.filter((s) => !s.holding.closed).sort(SORTS[sort].compare);
  const closed = mine.filter((s) => s.holding.closed);

  const closeModal = () => setModal(null);

  const runAction = (item) => {
    const s = item.summary;
    if (item.kind === 'sip-due') actions.logSip(s);
    else if (item.kind === 'matured') setModal({ type: 'txn', summary: s, defaultKind: 'withdraw', defaultAmount: Math.round(s.value), defaultClose: true });
    else if (item.kind === 'update-value') setModal({ type: 'txn', summary: s, defaultKind: 'value' });
  };

  const exportCsv = (which) => {
    exportRef.current?.removeAttribute('open');
    if (which === 'holdings') downloadCsv(`spendsense_investments_${today}.csv`, holdingsToCsv(summaries, goalsById));
    else downloadCsv(`spendsense_investment_entries_${today}.csv`, transactionsToCsv(txns, new Map(holdings.map((h) => [h.id, h]))));
  };

  const modals = (
    <>
      {modal?.type === 'holding' && (
        <HoldingForm
          holding={modal.holding}
          goals={goals}
          platforms={platforms}
          defaultCurrency={currency}
          initialAmount={modal.initialAmount}
          initialDate={modal.initialDate}
          onSave={actions.saveHoldingWithEntries}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'txn' && (
        <TransactionForm
          summary={modal.summary}
          defaultKind={modal.defaultKind}
          defaultAmount={modal.defaultAmount}
          defaultClose={modal.defaultClose}
          onSave={(entry) => actions.saveEntry(entry, modal.summary.holding, modal.summary.currency)}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'goal' && (
        <GoalForm
          goal={modal.goal}
          currency={currency}
          onSave={actions.saveGoal}
          onDelete={modal.goal ? () => actions.removeGoal(modal.goal, holdings.filter((h) => h.goalId === modal.goal.id)) : undefined}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'quick' && (
        <QuickInvestModal
          amount={modal.amount}
          date={modal.date}
          text={modal.text}
          currency={modal.currency || currency}
          holdings={holdings}
          onSave={(holding, txn) => actions.saveEntry({ txn }, holding, holding.currency || 'INR')}
          onNewHolding={() => setModal({ type: 'holding', initialAmount: modal.amount, initialDate: modal.date })}
          onClose={closeModal}
        />
      )}
    </>
  );

  if (loading) {
    return (
      <div className="investments-page page-container">
        <div className="empty-state">Loading investments…</div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="investments-page page-container">
        <h1 className="page-heading">Investments</h1>
        <div className="glass-card inv-empty">
          <div className="empty-state-icon">📈</div>
          <h2>Track what you’ve invested — separately from what you’ve spent</h2>
          <ul className="inv-empty-list">
            <li><strong>Everything in one place:</strong> stocks, mutual funds, SIPs, FDs, PPF, EPF, NPS, gold, crypto, property</li>
            <li><strong>Real returns:</strong> gain, return % and XIRR — the yearly return that accounts for when each SIP went in</li>
            <li><strong>Reminders:</strong> SIP due dates, FD maturities, lock-ins ending, values to refresh</li>
            <li><strong>Allocation and goals:</strong> how your money is spread, and how close each goal is</li>
          </ul>
          <button type="button" className="btn-accent" onClick={() => setModal({ type: 'holding' })}>
            Add your first investment
          </button>
          <p className="card-footnote">Saved on this device, and synced if you sign in. Values are entered by you — nothing connects to your broker.</p>
        </div>
        {modals}
      </div>
    );
  }

  return (
    <div className="investments-page page-container">
      <div className="inv-toolbar">
        <h1 className="page-heading">Investments</h1>
        <div className="inv-toolbar-actions">
          {currencies.length > 1 && (
            <div className="segmented" role="group" aria-label="Currency">
              {currencies.map((code) => (
                <button key={code} type="button" aria-pressed={code === currency} onClick={() => setChosenCurrency(code)}>
                  {CURRENCIES[code]?.symbol ?? ''} {code}
                </button>
              ))}
            </div>
          )}
          <details className="export-menu" ref={exportRef}>
            <summary className="btn-secondary">Export</summary>
            <div className="export-menu-list">
              <button type="button" onClick={() => exportCsv('holdings')}>
                <strong>Holdings (CSV)</strong>
                <span>One row per investment: invested, value, gain, XIRR, dates</span>
              </button>
              <button type="button" onClick={() => exportCsv('entries')}>
                <strong>All entries (CSV)</strong>
                <span>Every investment, withdrawal, dividend and value update</span>
              </button>
            </div>
          </details>
          <button type="button" className="btn-accent btn-compact" onClick={() => setModal({ type: 'holding' })}>
            + Add
          </button>
        </div>
      </div>

      {syncError && <p className="currency-note">Couldn’t sync investments just now — your changes are saved here and will sync later.</p>}

      {/* ─── Portfolio ─── */}
      <section className="stat-grid inv-stats" aria-label="Portfolio">
        <div className="glass-card stat-tile stat-tile-hero">
          <span className="stat-label">Current value</span>
          <span className="stat-value">{formatAmount(Math.round(portfolio.value), currency)}</span>
          <Gain amount={portfolio.gain} pct={portfolio.gainPct} currency={currency} />
          <span className="stat-sub">{plural(portfolio.count, 'investment')} · total gain incl. withdrawals & income</span>
        </div>
        <div className="glass-card stat-tile">
          <span className="stat-label">Invested</span>
          <span className="stat-value">{formatAmount(Math.round(portfolio.invested), currency)}</span>
          <span className="stat-sub">still in, at cost</span>
        </div>
        <div className="glass-card stat-tile">
          <span className="stat-label">XIRR</span>
          <span className="stat-value">
            {portfolio.xirr === null ? '—' : <Gain amount={portfolio.xirr} pct={portfolio.xirr} showAmount={false} />}
          </span>
          <span className="stat-sub">{portfolio.xirr === null ? 'shows after 3 months of history' : 'yearly, accounting for timing'}</span>
        </div>
        <div className="glass-card stat-tile">
          <span className="stat-label">This month</span>
          <span className="stat-value">{formatAmount(Math.round(portfolio.investedThisMonth), currency)}</span>
          <span className="stat-sub">
            invested{portfolio.monthlySip > 0 ? ` · SIPs ${formatAmount(portfolio.monthlySip, currency)}/month` : ''}
          </span>
        </div>
      </section>
      {portfolio.unvalued > 0 && (
        <p className="currency-note">
          {plural(portfolio.unvalued, 'investment')} {portfolio.unvalued === 1 ? 'is' : 'are'} shown at cost because no current value has been entered — update {portfolio.unvalued === 1 ? 'it' : 'them'} for real returns.
        </p>
      )}

      {/* ─── Needs attention ─── */}
      {attention.length > 0 && (
        <section className="dash-card inv-attention" aria-labelledby="attention-title">
          <div className="card-header">
            <h2 id="attention-title">Needs attention</h2>
            <span className="card-hint">next 30 days</span>
          </div>
          <ul className="attention-list">
            {attention.map((item) => {
              const d = describeItem(item, today);
              return (
                <li key={`${item.kind}-${item.holdingId}`} className={item.urgent ? 'is-urgent' : ''}>
                  <span className="attention-icon" aria-hidden="true">{d.icon}</span>
                  <span className="attention-text">
                    <Link to={`/investments/${item.holdingId}`}>{item.summary.holding.name}</Link>
                    <span>{d.text}</span>
                  </span>
                  {d.action && (
                    <button type="button" className="btn-secondary btn-small" onClick={() => runAction(item)}>
                      {d.actionLabel}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ─── Holdings ─── */}
      <section className="inv-holdings" aria-labelledby="holdings-title">
        <div className="section-header">
          <h2 id="holdings-title">Holdings</h2>
          <label className="inline-select">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="holding-list">
          {active.map((s) => (
            <HoldingRow key={s.holding.id} summary={s} goalName={goalsById.get(s.holding.goalId)?.name} />
          ))}
        </div>
        {closed.length > 0 && (
          <details className="closed-holdings">
            <summary>{plural(closed.length, 'closed investment')}</summary>
            <div className="holding-list">
              {closed.map((s) => <HoldingRow key={s.holding.id} summary={s} goalName={goalsById.get(s.holding.goalId)?.name} />)}
            </div>
          </details>
        )}
      </section>

      {/* ─── Allocation ─── */}
      <section className="dash-card inv-allocation" aria-labelledby="allocation-title">
        <div className="card-header">
          <h2 id="allocation-title">Allocation</h2>
          <div className="segmented segmented-small" role="group" aria-label="Group by">
            {Object.entries(ALLOCATION_VIEWS).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>
            ))}
          </div>
        </div>
        {allocationRows.length > 0 ? (
          <RankedList
            ariaLabel={`Current value by ${ALLOCATION_VIEWS[view].toLowerCase()}`}
            rows={allocationRows.map((row) => ({
              key: row.key,
              label: row.label,
              value: formatAmount(Math.round(row.value), currency),
              amount: row.value,
              meta: `${Math.round(row.share)}% · ${plural(row.count, 'holding')}`,
            }))}
          />
        ) : (
          <p className="card-note">Nothing with a value yet.</p>
        )}
      </section>

      {/* ─── Goals ─── */}
      <section className="dash-card inv-goals" aria-labelledby="goals-title">
        <div className="card-header">
          <h2 id="goals-title">Goals</h2>
          <button type="button" className="btn-link" onClick={() => setModal({ type: 'goal' })}>+ New goal</button>
        </div>
        {progress.length === 0 ? (
          <p className="card-note">
            Give your money a purpose — a house, retirement, an emergency fund. Set a target and date, link investments to it,
            and see how far along you are and what it takes each month.
          </p>
        ) : (
          <ul className="goal-list">
            {progress.map((p) => (
              <li key={p.goal.id}>
                <button type="button" className="goal-row" onClick={() => setModal({ type: 'goal', goal: p.goal })}>
                  <span className="goal-head">
                    <span className="goal-name">{p.goal.name}</span>
                    <span className="goal-figures">
                      {formatAmount(Math.round(p.current), currency)}
                      {p.target > 0 && <span className="goal-target"> of {formatAmount(p.target, currency)}</span>}
                    </span>
                  </span>
                  {p.target > 0 && (
                    <span className={`meter ${p.reached ? '' : p.onTrack === false ? 'meter-warning' : ''}`} aria-hidden="true">
                      <span className="meter-fill" style={{ width: `${p.pct}%` }} />
                    </span>
                  )}
                  <span className="goal-meta">
                    {p.reached
                      ? '✓ Reached'
                      : [
                          p.pct !== null && `${Math.round(p.pct)}%`,
                          p.goal.targetDate && `by ${monthYear(p.goal.targetDate)}`,
                          p.requiredMonthly > 0 && `needs ${formatAmount(Math.ceil(p.requiredMonthly), currency)}/month`,
                          p.requiredMonthly > 0 && `SIPs ${formatAmount(p.monthlySip, currency)}`,
                          p.linked.length === 0 && 'no investments linked yet',
                        ].filter(Boolean).join(' · ')}
                  </span>
                  {p.onTrack === false && !p.reached && (
                    <span className="status status-warning">
                      <span className="status-icon" aria-hidden="true">!</span>
                      {formatAmount(Math.ceil(p.requiredMonthly - p.monthlySip), currency)}/month short at your assumed {p.goal.expectedReturn || 0}% return
                    </span>
                  )}
                  {p.onTrack === true && !p.reached && (
                    <span className="status status-good">
                      <span className="status-icon" aria-hidden="true">✓</span>
                      On track with your SIPs
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="how-it-works">
        <summary>How values and returns are worked out</summary>
        <ul>
          <li><strong>Value</strong> — FDs, RDs, PPF, EPF, bonds and savings grow from their interest rate. Everything else uses the latest value you entered, plus money added or withdrawn since. Without a value it’s shown at cost.</li>
          <li><strong>Gain</strong> — current value + everything withdrawn + dividends/interest received − everything invested.</li>
          <li><strong>Return %</strong> — that gain over everything invested.</li>
          <li><strong>XIRR</strong> — the yearly rate that makes all your investments and withdrawals add up to today’s value. It’s the fair way to judge SIPs, where each installment has been invested for a different time.</li>
          <li>Nothing is fetched from brokers or markets: update values from your app or statement.</li>
        </ul>
      </details>

      {modals}
    </div>
  );
}

export default InvestmentsPage;
