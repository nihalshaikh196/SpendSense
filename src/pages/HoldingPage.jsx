import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useInvestments } from '../context/InvestmentContext.jsx';
import { useInvestmentActions } from '../hooks/useInvestmentActions.js';
import { formatAmount } from '../lib/currency.js';
import { relativeDay, spanDays, todayString } from '../lib/analytics.js';
import {
  COMMON_PLATFORMS,
  COMPOUNDING,
  formatHeld,
  summarizeHolding,
  TXN_KINDS,
} from '../lib/investments.js';
import Gain from '../components/investments/Gain.jsx';
import HoldingForm from '../components/investments/HoldingForm.jsx';
import TransactionForm from '../components/investments/TransactionForm.jsx';
import '../styles/reports.css';
import './InvestmentsPage.css';

const KIND_SIGN = { invest: '+', withdraw: '−', income: '+', value: '=' };

/** "Apr 1, 2025" — investment dates span years, so the year always shows. */
function longDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function HoldingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { holdings, txns, goals, loading } = useInvestments();
  const actions = useInvestmentActions();
  const [modal, setModal] = useState(null);
  const today = todayString();

  const holding = holdings.find((h) => h.id === id);
  const history = useMemo(() => txns.filter((t) => t.holdingId === id), [txns, id]);
  const summary = useMemo(
    () => (holding ? summarizeHolding(holding, history, today) : null),
    [holding, history, today],
  );
  const platforms = useMemo(
    () => [...new Set([...holdings.map((h) => h.platform).filter(Boolean), ...COMMON_PLATFORMS])],
    [holdings],
  );

  if (loading) {
    return <div className="investments-page page-container"><div className="empty-state">Loading…</div></div>;
  }

  if (!holding) {
    return (
      <div className="investments-page page-container">
        <Link to="/investments" className="back-link">← Investments</Link>
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <p className="empty-state-text">This investment doesn’t exist — it may have been deleted.</p>
        </div>
      </div>
    );
  }

  const { info, currency } = summary;
  const money = (n) => formatAmount(Math.round(n), currency);
  const goal = goals.find((g) => g.id === holding.goalId);
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

  const valueNote = {
    interest: `grows at ${holding.rate}% a year${holding.maturityDate && holding.maturityDate < today ? ' (stopped at maturity)' : ''}`,
    manual: [
      summary.valueDate === today ? 'valued today' : `valued ${longDate(summary.valueDate)}`,
      summary.movedSinceValuation > 0 && `+ ${money(summary.movedSinceValuation)} added since`,
      summary.movedSinceValuation < 0 && `− ${money(-summary.movedSinceValuation)} withdrawn since`,
    ].filter(Boolean).join(' '),
    cost: 'no value entered yet — shown at cost',
    closed: 'closed',
  }[summary.valueSource];

  const facts = [
    summary.firstDate && ['Invested since', `${longDate(summary.firstDate)} · ${formatHeld(summary.heldDays)}`],
    ['Put in', money(summary.totalIn)],
    summary.totalOut > 0 && ['Taken out', money(summary.totalOut)],
    summary.income > 0 && ['Dividends / interest', money(summary.income)],
    summary.units !== null && ['Units', `${summary.units}${summary.avgCost ? ` · avg ${formatAmount(summary.avgCost, currency)}` : ''}`],
    holding.rate > 0 && ['Interest', `${holding.rate}% · ${COMPOUNDING[holding.compounding || info.compounding] ?? ''}`],
    holding.maturityDate && [
      holding.maturityDate <= today ? 'Matured' : 'Matures',
      `${longDate(holding.maturityDate)}${holding.maturityDate > today ? ` · in ${formatHeld(spanDays(today, holding.maturityDate) - 1)}` : ''}`,
    ],
    holding.lockInUntil && [
      summary.locked ? 'Locked until' : 'Lock-in ended',
      longDate(holding.lockInUntil),
    ],
    summary.sip && [
      'SIP',
      `${money(holding.sipAmount)} on day ${holding.sipDay} · ${summary.sip.status === 'due' ? 'due now' : `next ${relativeDay(summary.sip.date, today)}`}`,
    ],
    goal && ['Goal', goal.name],
    holding.notes && ['Notes', holding.notes],
  ].filter(Boolean);

  const openEntry = (defaultKind, extra = {}) => setModal({ type: 'txn', defaultKind, ...extra });

  return (
    <div className="investments-page holding-page page-container">
      <Link to="/investments" className="back-link">← Investments</Link>

      <header className="holding-header">
        <span className="holding-emoji holding-emoji-lg" aria-hidden="true">{info.emoji}</span>
        <div className="holding-header-text">
          <h1>{holding.name}</h1>
          <p>{[info.label, holding.platform, holding.closed && 'Closed'].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" className="btn-secondary btn-small" onClick={() => setModal({ type: 'edit' })}>Edit</button>
      </header>

      <section className="glass-card holding-hero" aria-label="Value and returns">
        <div className="holding-hero-main">
          <span className="stat-label">{holding.closed ? 'Total return' : 'Current value'}</span>
          <span className="holding-hero-value">{holding.closed ? money(summary.gain) : money(summary.value)}</span>
          <span className="stat-sub">{valueNote}</span>
        </div>
        <dl className="holding-returns">
          <div>
            <dt>Gain</dt>
            <dd><Gain amount={summary.gain} pct={summary.gainPct} currency={currency} /></dd>
          </div>
          <div>
            <dt>XIRR</dt>
            <dd>
              {summary.xirr === null
                ? <span className="muted">{summary.heldDays < 90 ? 'after 3 months' : '—'}</span>
                : <Gain amount={summary.xirr} pct={summary.xirr} showAmount={false} />}
            </dd>
          </div>
          {!holding.closed && (
            <div>
              <dt>Invested</dt>
              <dd>{money(summary.invested)}</dd>
            </div>
          )}
        </dl>
      </section>

      {!holding.closed && (
        <div className="holding-actions">
          {summary.sip?.status === 'due' && (
            <button type="button" className="btn-accent btn-compact" onClick={() => actions.logSip(summary)}>
              Log {money(holding.sipAmount)} SIP
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => openEntry('invest')}>+ Add money</button>
          <button type="button" className="btn-secondary" onClick={() => openEntry('withdraw', summary.matured ? { defaultAmount: Math.round(summary.value), defaultClose: true } : {})}>
            Withdraw
          </button>
          <button type="button" className="btn-secondary" onClick={() => openEntry('income')}>Dividend / interest</button>
          {summary.valueSource !== 'interest' && (
            <button type="button" className={`btn-secondary ${summary.needsValue ? 'is-highlighted' : ''}`} onClick={() => openEntry('value')}>
              Update value
            </button>
          )}
        </div>
      )}

      <section className="dash-card" aria-labelledby="facts-title">
        <div className="card-header"><h2 id="facts-title">Details</h2></div>
        <dl className="fact-list">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="dash-card" aria-labelledby="history-title">
        <div className="card-header">
          <h2 id="history-title">History</h2>
          <span className="card-hint">{sorted.length} entr{sorted.length === 1 ? 'y' : 'ies'}</span>
        </div>
        {sorted.length === 0 ? (
          <p className="card-note">Nothing recorded yet. Add money to start tracking returns.</p>
        ) : (
          <ul className="txn-list">
            {sorted.map((t) => (
              <li key={t.id}>
                <button type="button" className="txn-row" onClick={() => setModal({ type: 'txn', txn: t })}>
                  <span className={`txn-kind txn-${t.kind}`}>{TXN_KINDS[t.kind]}</span>
                  <span className="txn-meta">
                    {relativeDay(t.date, today)}
                    {t.units ? ` · ${t.units} units` : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </span>
                  <span className="txn-amount">
                    <span aria-hidden="true">{KIND_SIGN[t.kind]} </span>{formatAmount(t.amount, currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {holding.closed && (
        <button type="button" className="btn-link" onClick={() => actions.saveHoldingWithEntries({ holding: { ...holding, closed: false } })}>
          Reopen this investment
        </button>
      )}

      {modal?.type === 'edit' && (
        <HoldingForm
          holding={holding}
          goals={goals}
          platforms={platforms}
          defaultCurrency={currency}
          onSave={actions.saveHoldingWithEntries}
          onDelete={async () => {
            await actions.removeHolding(holding);
            navigate('/investments');
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'txn' && (
        <TransactionForm
          summary={summary}
          txn={modal.txn}
          defaultKind={modal.defaultKind}
          defaultAmount={modal.defaultAmount}
          defaultClose={modal.defaultClose}
          onSave={(entry) => actions.saveEntry(entry, holding, currency)}
          onDelete={modal.txn ? () => actions.removeEntry(modal.txn) : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default HoldingPage;
