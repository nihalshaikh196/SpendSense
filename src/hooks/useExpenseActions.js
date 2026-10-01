import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatAmount } from '../lib/currency.js';
import { getCategoryLabel } from '../lib/categories.js';
import { logError } from '../lib/log.js';

const EDITABLE = ['amount', 'item', 'date', 'category', 'people'];

/** "coffee · ₹120" — how a toast names an expense. */
export function describeExpense(expense) {
  return `${expense.item || getCategoryLabel(expense.category)} · ${formatAmount(expense.amount, expense.currency)}`;
}

/**
 * Add, edit and delete with an Undo toast instead of a confirmation dialog:
 * the action happens at once, and a mistake is one tap to reverse.
 */
export function useExpenseActions() {
  const { addNewExpense, removeExpense, restoreExpense, editExpense } = useExpenses();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const addWithUndo = useCallback(async (items) => {
    const saved = [];
    for (const item of items) {
      saved.push(await addNewExpense(item));
    }
    showToast({
      message: saved.length === 1 ? `Added ${describeExpense(saved[0])}` : `Added ${saved.length} expenses`,
      actionLabel: 'Undo',
      onAction: () => {
        Promise.all(saved.map((e) => removeExpense(e.id))).catch((err) =>
          logError('Failed to undo add', err),
        );
      },
    });
    return saved;
  }, [addNewExpense, removeExpense, showToast]);

  const deleteWithUndo = useCallback(async (expense) => {
    try {
      await removeExpense(expense.id);
      showToast({
        message: `Deleted ${describeExpense(expense)}`,
        actionLabel: 'Undo',
        onAction: () => {
          restoreExpense(expense).catch((err) => logError('Failed to restore expense', err));
        },
      });
    } catch (err) {
      logError('Failed to delete expense', err);
      showToast({ message: 'Couldn’t delete that expense. Try again.' });
    }
  }, [removeExpense, restoreExpense, showToast]);

  const saveWithUndo = useCallback(async (expense, updates) => {
    const updated = await editExpense(expense.id, updates);
    const previous = Object.fromEntries(EDITABLE.map((field) => [field, expense[field]]));
    showToast({
      message: `Saved ${describeExpense(updated)}`,
      actionLabel: 'Undo',
      onAction: () => {
        editExpense(expense.id, previous).catch((err) => logError('Failed to undo edit', err));
      },
    });
    return updated;
  }, [editExpense, showToast]);

  /**
   * Opens the Investments page with an entry ready to file — for a sentence
   * like "added 180 in zerodha" that isn't spending at all.
   */
  const logAsInvestment = useCallback(({ amount, date, currency, text }) => {
    navigate('/investments', { state: { quickAdd: { amount, date, currency, text } } });
  }, [navigate]);

  /** An expense that was really an investment: take it out of spending. */
  const moveToInvestments = useCallback(async (expense) => {
    try {
      await removeExpense(expense.id);
      showToast({
        message: `Removed ${describeExpense(expense)} from expenses`,
        actionLabel: 'Undo',
        onAction: () => {
          restoreExpense(expense).catch((err) => logError('Failed to restore expense', err));
        },
      });
      logAsInvestment({
        amount: expense.amount,
        date: expense.date,
        currency: expense.currency,
        text: expense.raw || expense.item,
      });
    } catch (err) {
      logError('Failed to move expense', err);
      showToast({ message: 'Couldn’t move that expense. Try again.' });
    }
  }, [removeExpense, restoreExpense, showToast, logAsInvestment]);

  return { addWithUndo, deleteWithUndo, saveWithUndo, logAsInvestment, moveToInvestments };
}
