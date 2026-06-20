import { useState } from 'react';
import { useExpenses } from '../context/ExpenseContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { CURRENCIES } from '../lib/currency.js';
import { getExpenses } from '../lib/store.js';
import './SettingsPage.css';

function SettingsPage() {
  const { refreshExpenses, isSyncing } = useExpenses();
  const { currency, setCurrency, userName, setUserName } = useSettings();
  const { user, loginWithGoogle, logout } = useAuth();
  const [localName, setLocalName] = useState(userName);

  const handleNameBlur = () => {
    setUserName(localName.trim());
  };

  const handleExportCSV = async () => {
    try {
      const allExpenses = await getExpenses();
      if (allExpenses.length === 0) {
        alert("No expenses to export.");
        return;
      }

      // Headers
      const headers = ['Date', 'Item', 'Amount', 'Currency', 'Category', 'People', 'Raw Input'];
      
      // Rows
      const rows = allExpenses.map(exp => [
        exp.date,
        `"${(exp.item || '').replace(/"/g, '""')}"`, // escape quotes
        exp.amount,
        exp.currency,
        exp.category,
        `"${(exp.people || []).join(', ')}"`,
        `"${(exp.raw || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `spendsense_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export CSV', err);
      alert('Failed to export CSV.');
    }
  };

  const handleClearData = async () => {
    if (window.confirm("Are you sure you want to delete ALL your expenses? This cannot be undone.")) {
      try {
        // We delete directly from IndexedDB bypassing context to clear all at once
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('ExpenseTrackerDB', 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        
        const tx = db.transaction('expenses', 'readwrite');
        const store = tx.objectStore('expenses');
        const clearReq = store.clear();
        
        clearReq.onsuccess = () => {
          refreshExpenses();
          alert("All data cleared successfully.");
        };
      } catch (err) {
        console.error('Failed to clear data', err);
        alert('Failed to clear data.');
      }
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
                <strong>You can use SpendSense completely offline.</strong><br/>
                Login with Google only if you want to backup and sync your expenses across devices.
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
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Syncing... 🔄</span>
                ) : (
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-success)' }}>Synced ☁️✓</span>
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
            
            <button className="btn-danger" onClick={handleClearData}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Clear All Data
            </button>
          </div>
        </div>
      </section>

      {/* ─── About ─── */}
      <section className="settings-section" style={{ animationDelay: '300ms' }}>
        <div className="glass-card settings-card about-card">
          <div className="about-title">SpendSense</div>
          <div className="about-version">v1.0.0</div>
          <div className="about-tagline">Track expenses with natural language</div>
          <div className="about-credits">Built with React + Vite</div>
        </div>
      </section>

    </div>
  );
}

export default SettingsPage;
