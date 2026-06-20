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

const ExpenseContext = createContext(null);

export function ExpenseProvider({ children }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const { user } = useAuth();

  const refreshExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getExpenses();
      setExpenses(data);
    } catch (err) {
      console.error('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Run initial sync when user logs in
  useEffect(() => {
    if (user) {
      const syncData = async () => {
        setIsSyncing(true);
        try {
          await pullFromFirestore(user);
          await pushUnsyncedToFirestore(user);
          await refreshExpenses();
        } catch (e) {
          console.error("Sync error:", e);
        } finally {
          setIsSyncing(false);
        }
      };
      syncData();
    }
  }, [user, refreshExpenses]);

  const addNewExpense = useCallback(async (parsedData) => {
    try {
      const saved = await addExpense(parsedData);
      setExpenses((prev) => [saved, ...prev]);
      
      if (user) {
        setIsSyncing(true);
        syncSingleExpense(user, saved)
          .catch(console.error)
          .finally(() => setIsSyncing(false));
      }
      return saved;
    } catch (err) {
      console.error('Failed to add expense:', err);
      throw err;
    }
  }, [user]);

  const removeExpense = useCallback(async (id) => {
    try {
      await deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      
      if (user) {
        setIsSyncing(true);
        syncDeleteExpense(user, id)
          .catch(console.error)
          .finally(() => setIsSyncing(false));
      }
    } catch (err) {
      console.error('Failed to delete expense:', err);
      throw err;
    }
  }, [user]);

  const editExpense = useCallback(async (id, updates) => {
    try {
      const updated = await updateExpense(id, {...updates, synced: false});
      setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
      
      if (user) {
        setIsSyncing(true);
        syncSingleExpense(user, updated)
          .catch(console.error)
          .finally(() => setIsSyncing(false));
      }
      return updated;
    } catch (err) {
      console.error('Failed to edit expense:', err);
      throw err;
    }
  }, [user]);

  useEffect(() => {
    initDB()
      .then(() => refreshExpenses())
      .catch((err) => {
        console.error('Failed to initialize DB:', err);
        setLoading(false);
      });
  }, [refreshExpenses]);

  return (
    <ExpenseContext.Provider value={{ expenses, loading, isSyncing, addNewExpense, removeExpense, editExpense, refreshExpenses }}>
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
