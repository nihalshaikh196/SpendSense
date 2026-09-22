import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import HomePage from './pages/HomePage.jsx';
import ExpensesPage from './pages/ExpensesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { ExpenseProvider } from './context/ExpenseContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

// Chart.js is only needed here, so the dashboard loads as its own chunk.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <ExpenseProvider>
            <Routes>
              <Route element={<App />}>
                <Route index element={<HomePage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </ExpenseProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
