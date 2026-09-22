import { useRef, useState } from 'react';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { CURRENCIES } from '../lib/currency.js';
import { getExpenses, clearAllExpenses } from '../lib/store.js';
import { downloadCsv, expensesToCsv } from '../lib/csv.js';
import { todayString } from '../lib/analytics.js';
import { logError } from '../lib/log.js';
import Modal from '../components/Modal.jsx';
import './SettingsPage.css';

function SettingsPage() {
  const { refreshExpenses, isSyncing, syncError, retrySync } = useExpenses();
  const { currency, setCurrency, userName, setUserName } = useSettings();
  const { user, loginWithGoogle, logout } = useAuth();
  const [localName, setLocalName] = useState(userName);

  const handleNameBlur = () => {
    setUserName(localName.trim());
  };

  const [dataStatus, setDataStatus] = useState(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const cancelClearRef = useRef(null);

  const handleExportCSV = async () => {
    try {
      const allExpenses = await getExpenses();
      if (allExpenses.length === 0) {
        setDataStatus({ tone: 'info', text: 'No expenses to export yet.' });
        return;
      }
      downloadCsv(`spendsense_export_${todayString()}.csv`, expensesToCsv(allExpenses));
      setDataStatus({ tone: 'info', text: `Exported ${allExpenses.length} expense${allExpenses.length === 1 ? '' : 's'}.` });
    } catch (err) {
      logError('Failed to export CSV', err);
      setDataStatus({ tone: 'error', text: 'Export failed. Try again.' });
    }
  };

  const handleClearData = async () => {
    setConfirmingClear(false);
    try {
      const removed = await clearAllExpenses();
      await refreshExpenses();
      if (user) await retrySync();
      setDataStatus({ tone: 'info', text: `Cleared ${removed} expense${removed === 1 ? '' : 's'}.` });
    } catch (err) {
      logError('Failed to clear data', err);
      setDataStatus({ tone: 'error', text: 'Couldn’t clear data. Try again.' });
    }
  };

  return (
    <div className="settings-page page-container">
      <div className="settings-header">
        <span>⚙️</span> Settings
      </div>

      {/* ─── Account & Sync ─── */}
      <section className="settings-section" style={{ animationDelay: '0ms' }}>
        <h2 className="settings-section-title">Account & Sync</h2>
        <div className="glass-card settings-card">
          {!user ? (
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
              <p style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                <strong>No account needed.</strong> Your expenses are saved on this device.<br/>
                Sign in with Google only if you want to back up and sync them across devices.
              </p>
              <button className="btn-google" onClick={loginWithGoogle}>
                <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
            </div>
          ) : (
            <div className="settings-row" style={{ flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.displayName}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{user.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {isSyncing ? (
                  <span className="sync-state">Syncing… 🔄</span>
                ) : syncError ? (
                  <button className="sync-state sync-state-error" onClick={retrySync} title={syncError}>
                    Sync failed — retry
                  </button>
                ) : (
                  <span className="sync-state sync-state-ok">Synced ☁️✓</span>
                )}
                <button className="btn-secondary" onClick={logout}>Sign Out</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Preferences ─── */}
      <section className="settings-section" style={{ animationDelay: '100ms' }}>
        <h2 className="settings-section-title">Preferences</h2>
        <div className="glass-card settings-card">
          
          <div className="settings-row">
            <label>Default Currency</label>
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
            >
              {Object.values(CURRENCIES).map(c => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} — {c.name}
                </option>
              ))}
            </select>
            <span className="settings-helper">Used when no currency is mentioned in your text.</span>
          </div>

          <div className="settings-row">
            <label>Your Name</label>
            <input 
              type="text" 
              placeholder="e.g. John"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleNameBlur}
            />
            <span className="settings-helper">Used to exclude yourself from the 'with' list if you mention your own name.</span>
          </div>

        </div>
      </section>

      {/* ─── Data Management ─── */}
      <section className="settings-section" style={{ animationDelay: '200ms' }}>
        <h2 className="settings-section-title">Data Management</h2>
        <div className="glass-card settings-card">
          <div className="settings-actions">
            <button className="btn-ghost" onClick={handleExportCSV}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export as CSV
            </button>
            
            <button className="btn-danger" onClick={() => setConfirmingClear(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Clear All Data
            </button>
          </div>
          {dataStatus && (
            <p className={`settings-status ${dataStatus.tone === 'error' ? 'settings-status-error' : ''}`} role="status">
              {dataStatus.text}
            </p>
          )}
        </div>
      </section>

      {confirmingClear && (
        <Modal
          title="Delete all expenses?"
          onClose={() => setConfirmingClear(false)}
          initialFocusRef={cancelClearRef}
          className="modal-center"
          actions={
            <>
              <button ref={cancelClearRef} type="button" className="btn-secondary" onClick={() => setConfirmingClear(false)}>
                Cancel
              </button>
              <button type="button" className="btn-accent btn-confirm-danger" onClick={handleClearData}>
                Delete everything
              </button>
            </>
          }
        >
          <p>
            Every expense on this device will be deleted
            {user ? ', and from your synced backup too' : ''}. This can’t be undone — export a CSV first if you
            might want them later.
          </p>
        </Modal>
      )}

      {/* ─── About ─── */}
      <section className="settings-section" style={{ animationDelay: '300ms' }}>
        <div className="glass-card settings-card about-card">
          <div className="about-title">SpendSense</div>
          <div className="about-version">v1.0.1</div>
          <div className="about-tagline">Track expenses with natural language</div>
          <div className="about-credits">Built with React + Vite</div>
        </div>
      </section>

    </div>
  );
}

export default SettingsPage;
