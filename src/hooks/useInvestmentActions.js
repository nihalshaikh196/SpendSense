import { useCallback } from 'react';
import { useInvestments } from '../context/InvestmentContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatAmount } from '../lib/currency.js';
import { todayString } from '../lib/analytics.js';
import { TXN_KINDS } from '../lib/investments.js';
import { logError } from '../lib/log.js';

const report = (label) => (err) => logError(label, err);

/**
 * Investment writes with a confirming toast, and Undo where a slip is easy
 * (logging an entry, deleting anything).
 */
export function useInvestmentActions() {
  const { saveHolding, saveTxn, saveGoal, deleteHolding, deleteTxn, deleteGoal, restore } = useInvestments();
  const { showToast } = useToast();

  /** Create or update a holding; a new one can bring its first entries. */
  const saveHoldingWithEntries = useCallback(async ({ holding, newGoalName, initial }) => {
    let goalId = holding.goalId ?? null;
    if (newGoalName) goalId = (await saveGoal({ name: newGoalName })).id;
    const saved = await saveHolding({ ...holding, goalId });

    if (initial) {
      await saveTxn({
        holdingId: saved.id, kind: 'invest', date: initial.date, amount: initial.amount, units: initial.units, note: '',
      });
      if (initial.currentValue && initial.currentValue !== initial.amount) {
        await saveTxn({ holdingId: saved.id, kind: 'value', date: todayString(), amount: initial.currentValue, note: '' });
      }
    }
    showToast({ message: holding.id ? `Saved ${saved.name}` : `Added ${saved.name}` });
    return saved;
  }, [saveHolding, saveTxn, saveGoal, showToast]);

  const removeHolding = useCallback(async (holding) => {
    const removed = await deleteHolding(holding.id);
    showToast({
      message: `Deleted ${holding.name} and its history`,
      actionLabel: 'Undo',
      onAction: () => restore(removed).catch(report('Failed to restore holding')),
    });
  }, [deleteHolding, restore, showToast]);

  /** Log an entry; optionally close the holding (full withdrawal, maturity). */
  const saveEntry = useCallback(async ({ txn, close }, holding, currency) => {
    const saved = await saveTxn(txn);
    if (close && !holding.closed) await saveHolding({ ...holding, closed: true });
    const what = txn.kind === 'value'
      ? `Value of ${holding.name} set to ${formatAmount(txn.amount, currency)}`
      : `${TXN_KINDS[txn.kind]} ${formatAmount(txn.amount, currency)} · ${holding.name}`;
    showToast({
      message: txn.id ? 'Entry updated' : what,
      actionLabel: txn.id ? undefined : 'Undo',
      onAction: txn.id ? undefined : () => {
        deleteTxn(saved.id)
          .then(() => close && !holding.closed && saveHolding(holding))
          .catch(report('Failed to undo entry'));
      },
    });
    return saved;
  }, [saveTxn, saveHolding, deleteTxn, showToast]);

  const removeEntry = useCallback(async (txn) => {
    await deleteTxn(txn.id);
    showToast({
      message: 'Entry deleted',
      actionLabel: 'Undo',
      onAction: () => saveTxn(txn).catch(report('Failed to restore entry')),
    });
  }, [deleteTxn, saveTxn, showToast]);

  /** One-tap SIP installment, dated on its due day. */
  const logSip = useCallback((summary) => {
    const today = todayString();
    const date = summary.sip && summary.sip.date <= today ? summary.sip.date : today;
    return saveEntry(
      { txn: { holdingId: summary.holding.id, kind: 'invest', date, amount: summary.holding.sipAmount, note: 'SIP' } },
      summary.holding,
      summary.currency,
    );
  }, [saveEntry]);

  const saveGoalWithToast = useCallback(async (goal) => {
    const saved = await saveGoal(goal);
    showToast({ message: goal.id ? `Saved ${saved.name}` : `Added goal ${saved.name}` });
    return saved;
  }, [saveGoal, showToast]);

  const removeGoal = useCallback(async (goal, linkedHoldings) => {
    await deleteGoal(goal.id);
    showToast({
      message: `Deleted goal ${goal.name}`,
      actionLabel: 'Undo',
      onAction: async () => {
        try {
          await restore({ goal });
          for (const h of linkedHoldings) await saveHolding({ ...h, goalId: goal.id });
        } catch (err) {
          logError('Failed to restore goal', err);
        }
      },
    });
  }, [deleteGoal, restore, saveHolding, showToast]);

  return { saveHoldingWithEntries, removeHolding, saveEntry, removeEntry, logSip, saveGoal: saveGoalWithToast, removeGoal };
}
