/**
 * @module InvestmentContext
 * @description Holdings, their transactions and goals, kept in IndexedDB and
 * synced to Firestore when signed in. Writes land locally first and sync in
 * the background, the same offline-first shape as ExpenseContext.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { deleteRecords, getAllRecords, putRecord } from '../lib/investmentStore.js';
import { initDB } from '../lib/store.js';
import {
  syncInvestmentDeletes,
  syncInvestmentRecord,
  syncInvestments,
} from '../services/investmentSync.js';
import { logError } from '../lib/log.js';

const InvestmentContext = createContext(null);

const upsert = (list, record) => {
  const i = list.findIndex((r) => r.id === record.id);
  if (i === -1) return [...list, record];
  const next = [...list];
  next[i] = record;
  return next;
};

export function InvestmentProvider({ children }) {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState([]);
  const [txns, setTxns] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(null);

  const load = useCallback(async () => {
    try {
      await initDB();
      const [h, t, g] = await Promise.all([
        getAllRecords('holdings'),
        getAllRecords('investmentTxns'),
        getAllRecords('goals'),
      ]);
      setHoldings(h);
      setTxns(t);
      setGoals(g);
    } catch (err) {
      logError('Failed to load investments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => { await load(); };
    run();
  }, [load]);

  // Full sync whenever the signed-in user changes.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    syncInvestments(user)
      .then(() => !cancelled && load())
      .then(() => !cancelled && setSyncError(null))
      .catch((err) => {
        logError('Investment sync error:', err);
        if (!cancelled) setSyncError(err.message || 'Sync failed');
      });
    return () => { cancelled = true; };
  }, [user, load]);

  const inBackground = useCallback((run) => {
    if (!user) return;
    run()
      .then(() => setSyncError(null))
      .catch((err) => {
        logError('Investment sync failed:', err);
        setSyncError(err.message || 'Sync failed');
      });
  }, [user]);

  const setterFor = useMemo(
    () => ({ holdings: setHoldings, investmentTxns: setTxns, goals: setGoals }),
    [],
  );

  /**
   * Creates or replaces a record. Edits pass the whole record back (spread
   * over the original), so `put` covers both and keeps id and createdAt.
   */
  const save = useCallback(async (collection, record) => {
    const saved = await putRecord(collection, { ...record, synced: false });
    setterFor[collection]((prev) => upsert(prev, saved));
    inBackground(() => syncInvestmentRecord(user, collection, saved));
    return saved;
  }, [user, inBackground, setterFor]);

  const remove = useCallback(async (collection, ids) => {
    if (!ids.length) return;
    await deleteRecords(collection, ids);
    const gone = new Set(ids);
    setterFor[collection]((prev) => prev.filter((r) => !gone.has(r.id)));
    inBackground(() => syncInvestmentDeletes(user, collection, ids));
  }, [user, inBackground, setterFor]);

  const saveHolding = useCallback((holding) => save('holdings', holding), [save]);
  const saveTxn = useCallback((txn) => save('investmentTxns', txn), [save]);
  const saveGoal = useCallback((goal) => save('goals', goal), [save]);
  const deleteTxn = useCallback((id) => remove('investmentTxns', [id]), [remove]);

  /**
   * Deletes a holding and its whole history. Returns what was removed so the
   * caller can offer Undo via `restore`.
   */
  const deleteHolding = useCallback(async (id) => {
    const holding = holdings.find((h) => h.id === id);
    const history = txns.filter((t) => t.holdingId === id);
    await remove('investmentTxns', history.map((t) => t.id));
    await remove('holdings', [id]);
    return { holding, history };
  }, [holdings, txns, remove]);

  /** Deletes a goal and unlinks the holdings that pointed at it. */
  const deleteGoal = useCallback(async (id) => {
    for (const h of holdings.filter((x) => x.goalId === id)) {
      await save('holdings', { ...h, goalId: null });
    }
    await remove('goals', [id]);
  }, [holdings, save, remove]);

  /** Puts deleted records back with their original ids (Undo). */
  const restore = useCallback(async ({ holding, history = [], goal }) => {
    if (goal) await save('goals', goal);
    if (holding) await save('holdings', holding);
    for (const t of history) await save('investmentTxns', t);
  }, [save]);

  return (
    <InvestmentContext.Provider
      value={{
        holdings, txns, goals, loading, syncError,
        saveHolding, saveTxn, saveGoal, deleteHolding, deleteTxn, deleteGoal, restore,
      }}
    >
      {children}
    </InvestmentContext.Provider>
  );
}

export function useInvestments() {
  const ctx = useContext(InvestmentContext);
  if (!ctx) throw new Error('useInvestments must be used within an InvestmentProvider');
  return ctx;
}
