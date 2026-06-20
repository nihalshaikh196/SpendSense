# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build locally
```

There is no automated test suite. The parser can be manually tested with:
```bash
node test_parser.js
```

## Architecture

SpendSense is a React + Vite SPA — a mobile-first personal expense tracker with a natural language input system and local-first data storage.

### Data flow

1. User types a free-form sentence (e.g. "Spent 300 on vadapav with Wilson yesterday")
2. `src/lib/parser.js` → `parseExpense()` extracts: `amount`, `currency`, `date`, `item`, `people`, `category`, `raw`
3. `src/lib/categories.js` → `detectCategory()` maps item keywords to category keys
4. `src/lib/currency.js` → `detectCurrency()` identifies currency from keywords/symbols
5. `ExpenseContext` calls `src/lib/store.js` to persist to **IndexedDB** (`ExpenseTrackerDB`)
6. If user is authenticated, `src/services/sync.js` pushes to **Firestore** at `/users/{uid}/expenses/{expenseId}`

### Context providers (provider order in `src/main.jsx`)

```
AuthProvider → SettingsProvider → ExpenseProvider
```

- **`AuthContext`** — Firebase Google Auth; enforces 30-day session expiry via `localStorage('loginTimestamp')`; exposes `user`, `loginWithGoogle`, `logout`
- **`SettingsContext`** — currency preference and userName; persisted to `localStorage` keys `spendsense_currency` / `spendsense_username`
- **`ExpenseContext`** — wraps all IndexedDB CRUD (`addNewExpense`, `removeExpense`, `editExpense`, `refreshExpenses`); triggers Firestore sync on every mutation when `user` is present; exposes `isSyncing` for UI indicators

### Sync strategy

Local-first: every write goes to IndexedDB immediately. Firebase sync is fire-and-forget (errors are logged, not thrown). On login, `pullFromFirestore` then `pushUnsyncedToFirestore` run in sequence. Each expense has a `synced: boolean` field; unsynced records are identified by `synced === false`. Conflict resolution is last-write-wins by `createdAt`.

### Routing

`react-router-dom` v7 with `BrowserRouter`. `App.jsx` is the shell (bottom nav + `<Outlet>`). Routes: `/` → `HomePage`, `/expenses` → `ExpensesPage`, `/dashboard` → `DashboardPage`, `/settings` → `SettingsPage`.

### Expense schema (IndexedDB + Firestore)

```js
{
  id: string,          // uuid-v4
  amount: number,
  currency: string,    // 'INR' | 'USD' | 'EUR' | 'GBP'
  date: string,        // 'YYYY-MM-DD'
  item: string,
  people: string[],
  category: string,    // see CATEGORIES keys in src/lib/categories.js
  raw: string,         // original input sentence
  createdAt: number,   // timestamp ms
  synced: boolean
}
```

### Parser notes

`parseExpense(sentence, defaultCurrency)` in `src/lib/parser.js` is purely rule-based (no ML). It processes in order: currency → amount → date → people → item (by subtraction) → category. Date resolution handles relative expressions (`yesterday`, `last monday`, `3 days ago`) and absolute (`15th June`, `June 15`, `15/06`). Future dates default to last year.

### Firebase

Config is hardcoded in `src/services/firebase.js` (project: `expensesense-5050f`). Firestore security rules in `firestore.rules` restrict all reads/writes to the authenticated user's own subcollection only.
