/**
 * @module ToastContext
 * @description One transient message at a time, with an optional action
 * ("Undo"). Used to confirm adds, edits and deletes without a dialog.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import '../components/Toast.css';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 8000;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);

  const dismiss = useCallback(() => setToast(null), []);

  /**
   * @param {{ message: string, actionLabel?: string, onAction?: () => void, duration?: number }} options
   */
  const showToast = useCallback((options) => {
    nextId.current += 1;
    setPaused(false);
    setToast({ id: nextId.current, duration: DEFAULT_DURATION, ...options });
  }, []);

  // Auto-dismiss, held while the pointer or keyboard focus is on the toast
  // so there's time to reach the action.
  useEffect(() => {
    if (!toast || paused) return undefined;
    const timer = setTimeout(dismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast, paused, dismiss]);

  const runAction = () => {
    const action = toast?.onAction;
    dismiss();
    action?.();
  };

  return (
    <ToastContext.Provider value={{ showToast, dismissToast: dismiss }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className="toast"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <span className="toast-message">{toast.message}</span>
            {toast.actionLabel && (
              <button type="button" className="toast-action" onClick={runAction}>
                {toast.actionLabel}
              </button>
            )}
            <button type="button" className="toast-close" onClick={dismiss} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
