/**
 * @module ExpenseContext
 * @description React context wrapping the IndexedDB store for expense records.
 * Provides CRUD operations (addNewExpense, removeExpense, refreshExpenses) and
 * the current expenses list + loading state.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { addExpense, getExpenses, deleteExpense, updateExpense, initDB } from '../lib/store.js';
import { useAuth } from './AuthContext';
import { pullFromFirestore, pushUnsyncedToFirestore, syncSingleExpense, syncDeleteExpense } from '../services/sync';
import { logError } from '../lib/log.js';

const ExpenseContext = createContext(null);

export function ExpenseProvider({ children }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const { user } = useAuth();

  const refreshExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getExpenses();
      setExpenses(data);
    } catch (err) {
      logError('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fullSync = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      // Push first: replays offline deletions and uploads pending records so
      // the pull reconciles against an accurate remote.
      await pushUnsyncedToFirestore(user);
      await pullFromFirestore(user);
      await refreshExpenses();
      setSyncError(null);
    } catch (e) {
      logError('Sync error:', e);
      setSyncError(e.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [user, refreshExpenses]);

  useEffect(() => {
    const run = async () => { await fullSync(); };
    run();
  }, [fullSync]);

  // Fire-and-forget sync for a single record. Failures are surfaced but never
  // block the local write, which has already succeeded.
  const syncInBackground = useCallback((run) => {
    if (!user) return;
    setIsSyncing(true);
    run()
      .then(() => setSyncError(null))
      .catch((err) => {
        logError('Sync failed:', err);
        setSyncError(err.message || 'Sync failed');
      })
      .finally(() => setIsSyncing(false));
  }, [user]);

  const addNewExpense = useCallback(async (parsedData) => {
    const saved = await addExpense(parsedData);
    setExpenses((prev) => [saved, ...prev]);
    syncInBackground(() => syncSingleExpense(user, saved));
    return saved;
  }, [user, syncInBackground]);

  const removeExpense = useCallback(async (id) => {
    await deleteExpense(id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    syncInBackground(() => syncDeleteExpense(user, id));
  }, [user, syncInBackground]);

  // Undo for a delete: puts the exact record back — same id and createdAt —
  // as an unsynced write. If the remote delete is still pending, the next
  // sync replays it first and then re-uploads this, so the record survives.
  const restoreExpense = useCallback(async (expense) => {
    return addNewExpense({ ...expense, synced: false });
  }, [addNewExpense]);

  const editExpense = useCallback(async (id, updates) => {
    const updated = await updateExpense(id, { ...updates, synced: false });
    setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
    syncInBackground(() => syncSingleExpense(user, updated));
    return updated;
  }, [user, syncInBackground]);

  useEffect(() => {
    initDB()
      .then(() => refreshExpenses())
      .catch((err) => {
        logError('Failed to initialize DB:', err);
        setLoading(false);
      });
  }, [refreshExpenses]);

  return (
    <ExpenseContext.Provider value={{ expenses, loading, isSyncing, syncError, addNewExpense, removeExpense, restoreExpense, editExpense, refreshExpenses, retrySync: fullSync }}>
      {children}
    </ExpenseContext.Provider>
  );
}

export function useExpenses() {
  const ctx = useContext(ExpenseContext);
  if (!ctx) {
    throw new Error('useExpenses must be used within an ExpenseProvider');
  }
  return ctx;
}

export default ExpenseContext;
