/**
 * @module SettingsContext
 * @description React context for app settings — currency preference and
 * user name. Persisted to localStorage so preferences survive page refreshes.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const LS_CURRENCY_KEY = 'spendsense_currency';
const LS_USERNAME_KEY = 'spendsense_username';

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
    <SettingsContext.Provider value={{ currency, setCurrency, userName, setUserName }}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access the settings context.
 * @returns {{ currency: string, setCurrency: (code: string) => void, userName: string, setUserName: (name: string) => void }}
 */
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}

export default SettingsContext;
