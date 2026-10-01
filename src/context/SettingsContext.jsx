/**
 * @module SettingsContext
 * @description React context for app settings — currency preference, user
 * name, and monthly budgets. Persisted to localStorage so preferences survive
 * page refreshes. Budgets are per device; they aren't synced.
 */

import { createContext, useContext, useState, useCallback } from 'react';

const LS_CURRENCY_KEY = 'spendsense_currency';
const LS_USERNAME_KEY = 'spendsense_username';
const LS_BUDGETS_KEY = 'spendsense_budgets';

function readBudgets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_BUDGETS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const SettingsContext = createContext(null);

/**
 * Provides global settings state (currency, userName) with localStorage persistence.
 */
export function SettingsProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    try {
      return localStorage.getItem(LS_CURRENCY_KEY) || 'INR';
    } catch {
      return 'INR';
    }
  });

  const [userName, setUserNameState] = useState(() => {
    try {
      return localStorage.getItem(LS_USERNAME_KEY) || '';
    } catch {
      return '';
    }
  });

  // Monthly budget per currency code, e.g. { INR: 20000 }. A budget in one
  // currency says nothing about spending in another, so they're kept apart.
  const [budgets, setBudgets] = useState(readBudgets);

  const setBudget = useCallback((code, amount) => {
    setBudgets((prev) => {
      const next = { ...prev };
      if (Number.isFinite(amount) && amount > 0) {
        next[code] = amount;
      } else {
        delete next[code];
      }
      try {
        localStorage.setItem(LS_BUDGETS_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable — budget lasts for this session only
      }
      return next;
    });
  }, []);

  const setCurrency = useCallback((code) => {
    setCurrencyState(code);
    try {
      localStorage.setItem(LS_CURRENCY_KEY, code);
    } catch {
      // localStorage unavailable — ignore silently
    }
  }, []);

  const setUserName = useCallback((name) => {
    setUserNameState(name);
    try {
      localStorage.setItem(LS_USERNAME_KEY, name);
    } catch {
      // localStorage unavailable — ignore silently
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ currency, setCurrency, userName, setUserName, budgets, setBudget }}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access the settings context.
 * @returns {{
 *   currency: string, setCurrency: (code: string) => void,
 *   userName: string, setUserName: (name: string) => void,
 *   budgets: Record<string, number>, setBudget: (code: string, amount: number) => void
 * }}
 */
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}

export default SettingsContext;
