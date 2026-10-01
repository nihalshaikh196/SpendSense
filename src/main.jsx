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
import { ToastProvider } from './context/ToastContext.jsx';
import { InvestmentProvider } from './context/InvestmentContext.jsx';

// Chart.js is only needed here, so the dashboard loads as its own chunk.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage.jsx'));
const HoldingPage = lazy(() => import('./pages/HoldingPage.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <ExpenseProvider>
            <InvestmentProvider>
              <ToastProvider>
                <Routes>
                  <Route element={<App />}>
                    <Route index element={<HomePage />} />
                    <Route path="expenses" element={<ExpensesPage />} />
                    <Route path="investments" element={<InvestmentsPage />} />
                    <Route path="investments/:id" element={<HoldingPage />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Routes>
              </ToastProvider>
            </InvestmentProvider>
          </ExpenseProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
